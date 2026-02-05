import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { BN, Wallet } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

import { LegasiClient } from './client';
import { PROGRAM_IDS, SEEDS, DEFAULTS, DECIMALS } from './constants';
import { TxResult, FlashLoanParams } from './types';

/**
 * Client for Flash Loan operations
 * 
 * Flash loans allow borrowing without collateral, as long as
 * the loan is repaid within the same transaction.
 * 
 * @example
 * ```typescript
 * const flash = new FlashLoanClient(connection, wallet);
 * 
 * // Execute flash loan with arbitrage
 * await flash.execute({
 *   amount: 10000, // $10,000 USDC
 *   mint: USDC_MINT,
 *   innerInstructions: [
 *     // Your arbitrage instructions here
 *   ],
 * });
 * ```
 */
export class FlashLoanClient extends LegasiClient {
  constructor(connection: Connection, wallet: Wallet) {
    super(connection, wallet);
  }

  /**
   * Calculate flash loan fee
   * @param amount Loan amount
   * @returns Fee amount
   */
  calculateFee(amount: number): number {
    return (amount * DEFAULTS.FLASH_FEE_BPS) / 10000;
  }

  /**
   * Execute a flash loan
   * 
   * This wraps your inner instructions with flash_borrow and flash_repay.
   * The loan must be repaid (with fee) within the same transaction.
   */
  async execute(params: FlashLoanParams): Promise<TxResult> {
    const amount = typeof params.amount === 'number'
      ? new BN(params.amount * Math.pow(10, DECIMALS.USDC))
      : params.amount;

    const fee = this.calculateFee(
      typeof params.amount === 'number' ? params.amount : params.amount.toNumber()
    );
    const repayAmount = amount.add(new BN(fee * Math.pow(10, DECIMALS.USDC)));

    const [lpPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.LP_POOL), params.mint.toBuffer()],
      PROGRAM_IDS.LP
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.LP_VAULT), params.mint.toBuffer()],
      PROGRAM_IDS.LP
    );

    // Flash loan PDA (unique per borrower + slot)
    const slot = await this.connection.getSlot();
    const [flashLoanPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(SEEDS.FLASH),
        this.wallet.publicKey.toBuffer(),
        new BN(slot).toArrayLike(Buffer, 'le', 8),
      ],
      PROGRAM_IDS.FLASH
    );

    const userTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      this.wallet.publicKey
    );

    try {
      // Build flash_borrow instruction
      const borrowIx = new TransactionInstruction({
        keys: [
          { pubkey: flashLoanPda, isSigner: false, isWritable: true },
          { pubkey: lpPoolPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: params.mint, isSigner: false, isWritable: false },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.FLASH,
        data: Buffer.concat([
          Buffer.from([0]), // flash_borrow discriminator
          amount.toArrayLike(Buffer, 'le', 8),
        ]),
      });

      // Build flash_repay instruction
      const repayIx = new TransactionInstruction({
        keys: [
          { pubkey: flashLoanPda, isSigner: false, isWritable: true },
          { pubkey: lpPoolPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: params.mint, isSigner: false, isWritable: false },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.FLASH,
        data: Buffer.concat([
          Buffer.from([1]), // flash_repay discriminator
          repayAmount.toArrayLike(Buffer, 'le', 8),
        ]),
      });

      // Build complete transaction: borrow -> inner instructions -> repay
      const tx = new Transaction()
        .add(borrowIx)
        .add(...params.innerInstructions)
        .add(repayIx);

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
   * Get available flash loan liquidity for a token
   */
  async getAvailableLiquidity(mint: PublicKey): Promise<number> {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.LP_VAULT), mint.toBuffer()],
      PROGRAM_IDS.LP
    );

    try {
      const balance = await this.connection.getTokenAccountBalance(vaultPda);
      return balance.value.uiAmount ?? 0;
    } catch {
      return 0;
    }
  }
}
