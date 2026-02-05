import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { BN, Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

import { PROGRAM_IDS, SEEDS, DEFAULTS, DECIMALS } from './constants';
import {
  Position,
  HealthStatus,
  TxResult,
  BorrowParams,
  RepayParams,
  PriceFeed,
} from './types';
import {
  calculateLTV,
  calculateHealthFactor,
  calculateLiquidationPrice,
  calculateMaxBorrow,
  calculateReputationBonus,
  solToLamports,
  lamportsToSol,
  findPositionPda,
  retry,
} from './utils';

/**
 * Main Legasi client for interacting with the protocol
 * 
 * @example
 * ```typescript
 * const client = new LegasiClient(connection, wallet);
 * 
 * // Initialize position
 * await client.initializePosition();
 * 
 * // Deposit 1 SOL
 * await client.depositSol(1);
 * 
 * // Borrow 50 USDC
 * await client.borrow({ amount: 50, mint: USDC_MINT });
 * 
 * // Check health
 * const health = await client.getHealthStatus();
 * console.log(`Health Factor: ${health.healthFactor}`);
 * ```
 */
export class LegasiClient {
  public readonly connection: Connection;
  public readonly wallet: Wallet;
  public readonly provider: AnchorProvider;
  
  private positionPda: PublicKey | null = null;
  private positionBump: number | null = null;

  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.wallet = wallet;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
  }

  /**
   * Get the position PDA for the current wallet
   */
  getPositionPda(): [PublicKey, number] {
    if (this.positionPda && this.positionBump !== null) {
      return [this.positionPda, this.positionBump];
    }
    
    const [pda, bump] = findPositionPda(
      this.wallet.publicKey,
      PROGRAM_IDS.LENDING
    );
    
    this.positionPda = pda;
    this.positionBump = bump;
    
    return [pda, bump];
  }

  /**
   * Check if position exists
   */
  async positionExists(): Promise<boolean> {
    const [positionPda] = this.getPositionPda();
    const account = await this.connection.getAccountInfo(positionPda);
    return account !== null;
  }

  /**
   * Initialize a new lending position
   */
  async initializePosition(): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    
    // Check if already exists
    if (await this.positionExists()) {
      return {
        signature: '',
        success: true,
        error: 'Position already exists',
      };
    }

    try {
      // Build instruction
      // Note: In production, this would use the actual program IDL
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.LENDING,
        data: Buffer.from([0]), // initialize_position discriminator
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Deposit SOL as collateral
   * @param amount Amount in SOL (e.g., 1.5 for 1.5 SOL)
   */
  async depositSol(amount: number): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    const lamports = solToLamports(amount);

    const [solVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.SOL_VAULT)],
      PROGRAM_IDS.LENDING
    );

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: solVaultPda, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.LENDING,
        data: Buffer.concat([
          Buffer.from([1]), // deposit_sol discriminator
          lamports.toArrayLike(Buffer, 'le', 8),
        ]),
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Withdraw SOL collateral
   * @param amount Amount in SOL to withdraw
   */
  async withdrawSol(amount: number): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    const lamports = solToLamports(amount);

    const [solVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.SOL_VAULT)],
      PROGRAM_IDS.LENDING
    );

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: solVaultPda, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.LENDING,
        data: Buffer.concat([
          Buffer.from([2]), // withdraw_sol discriminator
          lamports.toArrayLike(Buffer, 'le', 8),
        ]),
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Borrow tokens against collateral
   */
  async borrow(params: BorrowParams): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    const amount = typeof params.amount === 'number'
      ? new BN(params.amount * Math.pow(10, DECIMALS.USDC))
      : params.amount;

    const [lpPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.LP_POOL), params.mint.toBuffer()],
      PROGRAM_IDS.LP
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.LP_VAULT), params.mint.toBuffer()],
      PROGRAM_IDS.LP
    );

    const userTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      this.wallet.publicKey
    );

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: lpPoolPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: params.mint, isSigner: false, isWritable: false },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.LENDING,
        data: Buffer.concat([
          Buffer.from([3]), // borrow discriminator
          amount.toArrayLike(Buffer, 'le', 8),
        ]),
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Repay borrowed tokens
   */
  async repay(params: RepayParams): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    const amount = typeof params.amount === 'number'
      ? new BN(params.amount * Math.pow(10, DECIMALS.USDC))
      : params.amount;

    const [lpPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.LP_POOL), params.mint.toBuffer()],
      PROGRAM_IDS.LP
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.LP_VAULT), params.mint.toBuffer()],
      PROGRAM_IDS.LP
    );

    const userTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      this.wallet.publicKey
    );

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: lpPoolPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: params.mint, isSigner: false, isWritable: false },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.LENDING,
        data: Buffer.concat([
          Buffer.from([4]), // repay discriminator
          amount.toArrayLike(Buffer, 'le', 8),
        ]),
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get current position data
   */
  async getPosition(): Promise<Position | null> {
    const [positionPda] = this.getPositionPda();
    
    try {
      const account = await this.connection.getAccountInfo(positionPda);
      if (!account) return null;
      
      // Decode position data
      // In production, use the program's IDL decoder
      // This is a simplified example
      return {
        owner: this.wallet.publicKey,
        collateralSol: new BN(0),
        collateralSpl: new BN(0),
        collateralMint: null,
        debtAmount: new BN(0),
        debtMint: null,
        lastUpdate: new BN(Date.now() / 1000),
        reputationScore: 0,
        successfulRepayments: 0,
        totalVolumeRepaid: new BN(0),
        gadEvents: 0,
        bump: 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get current SOL price
   */
  async getSolPrice(): Promise<number> {
    // In production, fetch from Pyth or on-chain price feed
    // For demo, return mock price
    return 100; // $100 per SOL
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const position = await this.getPosition();
    const solPrice = await this.getSolPrice();
    
    if (!position) {
      return {
        ltv: 0,
        healthFactor: Infinity,
        liquidationPrice: null,
        collateralValueUsd: 0,
        debtValueUsd: 0,
        availableToBorrow: 0,
        isHealthy: true,
        gadActive: false,
      };
    }

    const collateralSol = lamportsToSol(position.collateralSol);
    const collateralValueUsd = collateralSol * solPrice;
    const debtValueUsd = position.debtAmount.toNumber() / Math.pow(10, DECIMALS.USDC);
    
    const reputationBonus = calculateReputationBonus(position.reputationScore);
    const effectiveMaxLtv = DEFAULTS.SOL_MAX_LTV_BPS + reputationBonus;
    
    const ltv = calculateLTV(collateralValueUsd, debtValueUsd);
    const healthFactor = calculateHealthFactor(
      collateralValueUsd,
      debtValueUsd,
      DEFAULTS.LIQUIDATION_THRESHOLD_BPS
    );
    const liquidationPrice = calculateLiquidationPrice(
      collateralSol,
      debtValueUsd,
      DEFAULTS.LIQUIDATION_THRESHOLD_BPS
    );
    const availableToBorrow = calculateMaxBorrow(
      collateralValueUsd,
      debtValueUsd,
      effectiveMaxLtv
    );

    return {
      ltv,
      healthFactor,
      liquidationPrice,
      collateralValueUsd,
      debtValueUsd,
      availableToBorrow,
      isHealthy: healthFactor > 1,
      gadActive: ltv > DEFAULTS.GAD_START_THRESHOLD_BPS / 100,
    };
  }

  /**
   * Get wallet SOL balance
   */
  async getWalletBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return lamportsToSol(balance);
  }
}
