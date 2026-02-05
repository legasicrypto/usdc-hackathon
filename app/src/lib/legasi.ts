import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } from "@solana/spl-token";

// Import IDLs
import LegasiCoreIDL from "@/idl/legasi_core.json";
import LegasiLendingIDL from "@/idl/legasi_lending.json";
import LegasiLpIDL from "@/idl/legasi_lp.json";

// Program IDs (Devnet - deployed 2026-02-05)
export const LEGASI_CORE_PROGRAM_ID = new PublicKey("4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy");
export const LEGASI_LENDING_PROGRAM_ID = new PublicKey("9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw");
export const LEGASI_LP_PROGRAM_ID = new PublicKey("CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY");
export const LEGASI_GAD_PROGRAM_ID = new PublicKey("89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK");
export const LEGASI_FLASH_PROGRAM_ID = new PublicKey("Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m");
export const LEGASI_LEVERAGE_PROGRAM_ID = new PublicKey("AVATHjGrdQ1KqtjHQ4gwRcuAYjwwScwgPsujLDpiA2g3");

// Token Mints (Devnet test tokens)
export const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const USDC_MINT = new PublicKey("3J2i1X4VGSxkEiHdnq4zead7hiSYbQHs9ZZaS36yAfX8"); // Test USDC
export const EURC_MINT = new PublicKey("6KeaPv9QA3VYaf62dfDzC785U8Cfa5VbsgtBH5ZWWf7v"); // Test EURC
export const CBBTC_MINT = new PublicKey("3J2i1X4VGSxkEiHdnq4zead7hiSYbQHs9ZZaS36yAfX8"); // Placeholder (using USDC)

// Helper to get PDAs
export function getProtocolPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    LEGASI_CORE_PROGRAM_ID
  );
}

export function getPositionPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), owner.toBuffer()],
    LEGASI_LENDING_PROGRAM_ID
  );
}

export function getAgentConfigPDA(position: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent_config"), position.toBuffer()],
    LEGASI_LENDING_PROGRAM_ID
  );
}

export function getLpPoolPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp_pool"), mint.toBuffer()],
    LEGASI_LP_PROGRAM_ID
  );
}

export function getPriceFeedPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price"), mint.toBuffer()],
    LEGASI_CORE_PROGRAM_ID
  );
}

// Types
export interface Position {
  owner: PublicKey;
  collaterals: { assetType: number; amount: BN }[];
  borrows: { assetType: number; amount: BN; accruedInterest: BN }[];
  lastUpdate: BN;
  lastGadCrank: BN;
  gadEnabled: boolean;
  totalGadLiquidatedUsd: BN;
  reputation: {
    successfulRepayments: number;
    totalRepaidUsd: BN;
    gadEvents: number;
    accountAgeDays: number;
  };
  bump: number;
}

export interface AgentConfig {
  position: PublicKey;
  operator: PublicKey;
  dailyBorrowLimit: BN;
  dailyBorrowed: BN;
  periodStart: BN;
  autoRepayEnabled: boolean;
  x402Enabled: boolean;
  alertsEnabled: boolean;
  alertThresholdBps: number;
  bump: number;
}

export interface LpPool {
  borrowableMint: PublicKey;
  lpTokenMint: PublicKey;
  totalDeposits: BN;
  totalShares: BN;
  totalBorrowed: BN;
  interestEarned: BN;
  bump: number;
}

// Legasi Client Class
export class LegasiClient {
  constructor(
    public provider: AnchorProvider,
    public coreProgram: Program,
    public lendingProgram: Program,
    public lpProgram: Program
  ) {}

  // Position Management
  async initializePosition(): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    
    const tx = await this.lendingProgram.methods
      .initializePosition()
      .accounts({
        position: positionPDA,
        owner: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    return tx;
  }

  async getPosition(owner: PublicKey): Promise<Position | null> {
    const [positionPDA] = getPositionPDA(owner);
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const position = await (this.lendingProgram.account as any).position.fetch(positionPDA);
      return position as Position;
    } catch {
      return null;
    }
  }

  // Deposit SOL
  async depositSol(amount: number): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    const solVaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault"), positionPDA.toBuffer()],
      LEGASI_LENDING_PROGRAM_ID
    )[0];
    
    const lamports = new BN(amount * LAMPORTS_PER_SOL);
    
    const tx = await this.lendingProgram.methods
      .depositSol(lamports)
      .accounts({
        position: positionPDA,
        solVault: solVaultPDA,
        owner: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    return tx;
  }

  // Borrow USDC
  async borrow(amount: number): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    const [protocolPDA] = getProtocolPDA();
    const [priceFeedPDA] = getPriceFeedPDA(SOL_MINT);
    
    // Use lending_vault (owned by lending program)
    const lendingVaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_vault"), USDC_MINT.toBuffer()],
      LEGASI_LENDING_PROGRAM_ID
    )[0];
    
    // Get user's USDC ATA
    const userUsdcAta = await this.findAta(this.provider.wallet.publicKey, USDC_MINT);
    
    const usdcAmount = new BN(amount * 1_000_000); // 6 decimals
    
    const tx = await this.lendingProgram.methods
      .borrow(usdcAmount)
      .accounts({
        position: positionPDA,
        protocol: protocolPDA,
        borrowableConfig: PublicKey.findProgramAddressSync(
          [Buffer.from("borrowable"), USDC_MINT.toBuffer()],
          LEGASI_CORE_PROGRAM_ID
        )[0],
        borrowVault: lendingVaultPDA,
        userTokenAccount: userUsdcAta,
        solPriceFeed: priceFeedPDA,
        solMint: SOL_MINT,
        owner: this.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return tx;
  }

  // Configure Agent (creates or updates)
  async configureAgent(
    dailyLimit: number,
    autoRepay: boolean,
    x402Enabled: boolean
  ): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    const [agentConfigPDA] = getAgentConfigPDA(positionPDA);
    
    // Check if agent config already exists
    const existingConfig = await this.provider.connection.getAccountInfo(agentConfigPDA);
    
    if (existingConfig) {
      // Update existing config
      const tx = await this.lendingProgram.methods
        .updateAgentConfig(
          new BN(dailyLimit * 1_000_000),
          autoRepay,
          x402Enabled,
          7500
        )
        .accounts({
          position: positionPDA,
          agentConfig: agentConfigPDA,
          owner: this.provider.wallet.publicKey,
        })
        .rpc();
      return tx;
    } else {
      // Create new config
      const tx = await this.lendingProgram.methods
        .configureAgent(
          new BN(dailyLimit * 1_000_000),
          autoRepay,
          x402Enabled,
          7500
        )
        .accounts({
          position: positionPDA,
          agentConfig: agentConfigPDA,
          owner: this.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      return tx;
    }
  }

  // Repay borrowed amount
  async repay(amount: number, assetType: number): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    
    const mint = assetType === 2 ? USDC_MINT : EURC_MINT;
    
    // Use lending_vault (owned by lending program)
    const lendingVaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lending_vault"), mint.toBuffer()],
      LEGASI_LENDING_PROGRAM_ID
    )[0];
    
    const userTokenAta = await this.findAta(this.provider.wallet.publicKey, mint);
    
    const repayAmount = new BN(amount * 1_000_000); // 6 decimals
    
    const tx = await this.lendingProgram.methods
      .repay(repayAmount)
      .accounts({
        position: positionPDA,
        borrowableConfig: PublicKey.findProgramAddressSync(
          [Buffer.from("borrowable"), mint.toBuffer()],
          LEGASI_CORE_PROGRAM_ID
        )[0],
        repayVault: lendingVaultPDA,
        userTokenAccount: userTokenAta,
        owner: this.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return tx;
  }

  // Withdraw SOL collateral
  async withdrawSol(amount: number): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    const [priceFeedPDA] = getPriceFeedPDA(SOL_MINT);
    
    const solVaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault"), positionPDA.toBuffer()],
      LEGASI_LENDING_PROGRAM_ID
    )[0];
    
    const lamports = new BN(amount * LAMPORTS_PER_SOL);
    
    const tx = await this.lendingProgram.methods
      .withdrawSol(lamports)
      .accounts({
        position: positionPDA,
        solVault: solVaultPDA,
        solPriceFeed: priceFeedPDA,
        solMint: SOL_MINT,
        owner: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    return tx;
  }

  // Deposit SPL Token (cbBTC, etc.)
  async depositToken(amount: number, mint: PublicKey, decimals: number): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    
    const collateralVaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("collateral_vault"), positionPDA.toBuffer(), mint.toBuffer()],
      LEGASI_LENDING_PROGRAM_ID
    )[0];
    
    const userTokenAta = await this.findAta(this.provider.wallet.publicKey, mint);
    
    const tokenAmount = new BN(amount * Math.pow(10, decimals));
    
    const tx = await this.lendingProgram.methods
      .depositToken(tokenAmount)
      .accounts({
        position: positionPDA,
        collateralVault: collateralVaultPDA,
        userTokenAccount: userTokenAta,
        tokenMint: mint,
        owner: this.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    return tx;
  }

  // LP Deposit
  async lpDeposit(amount: number, mint: PublicKey = USDC_MINT): Promise<string> {
    const [lpPoolPDA] = getLpPoolPDA(mint);
    
    const lpTokenMintPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_token"), mint.toBuffer()],
      LEGASI_LP_PROGRAM_ID
    )[0];
    
    const vaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_vault"), mint.toBuffer()],
      LEGASI_LP_PROGRAM_ID
    )[0];
    
    const userTokenAta = await this.findAta(this.provider.wallet.publicKey, mint);
    const userLpAta = await getAssociatedTokenAddress(lpTokenMintPDA, this.provider.wallet.publicKey);
    
    // Check if LP token account exists, if not add create instruction
    const preInstructions = [];
    const lpAccountInfo = await this.provider.connection.getAccountInfo(userLpAta);
    if (!lpAccountInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.provider.wallet.publicKey, // payer
          userLpAta, // ata
          this.provider.wallet.publicKey, // owner
          lpTokenMintPDA // mint
        )
      );
    }
    
    const tokenAmount = new BN(amount * 1_000_000);
    
    const tx = await this.lpProgram.methods
      .deposit(tokenAmount)
      .accounts({
        lpPool: lpPoolPDA,
        lpTokenMint: lpTokenMintPDA,
        vault: vaultPDA,
        userTokenAccount: userTokenAta,
        userLpTokenAccount: userLpAta,
        depositor: this.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions(preInstructions)
      .rpc();
    
    return tx;
  }

  // LP Withdraw
  async lpWithdraw(shares: number, mint: PublicKey = USDC_MINT): Promise<string> {
    const [lpPoolPDA] = getLpPoolPDA(mint);
    
    const lpTokenMintPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_token"), mint.toBuffer()],
      LEGASI_LP_PROGRAM_ID
    )[0];
    
    const vaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_vault"), mint.toBuffer()],
      LEGASI_LP_PROGRAM_ID
    )[0];
    
    const userTokenAta = await this.findAta(this.provider.wallet.publicKey, mint);
    const userLpAta = await this.findAta(this.provider.wallet.publicKey, lpTokenMintPDA);
    
    const shareAmount = new BN(shares * 1_000_000);
    
    const tx = await this.lpProgram.methods
      .withdraw(shareAmount)
      .accounts({
        lpPool: lpPoolPDA,
        lpTokenMint: lpTokenMintPDA,
        vault: vaultPDA,
        userTokenAccount: userTokenAta,
        userLpTokenAccount: userLpAta,
        withdrawer: this.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return tx;
  }

  // Helper: Find Associated Token Account
  async findAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    const [ata] = PublicKey.findProgramAddressSync(
      [
        owner.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    );
    return ata;
  }
}

// Create client from provider
export async function createLegasiClient(
  provider: AnchorProvider
): Promise<LegasiClient> {
  // Use local IDLs (bundled with the app)
  const coreProgram = new Program(LegasiCoreIDL as Idl, provider);
  const lendingProgram = new Program(LegasiLendingIDL as Idl, provider);
  const lpProgram = new Program(LegasiLpIDL as Idl, provider);
  
  return new LegasiClient(provider, coreProgram, lendingProgram, lpProgram);
}
