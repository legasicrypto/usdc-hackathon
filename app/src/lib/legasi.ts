import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Import IDLs
import LegasiCoreIDL from "@/idl/legasi_core.json";
import LegasiLendingIDL from "@/idl/legasi_lending.json";
import LegasiLpIDL from "@/idl/legasi_lp.json";

// Program IDs
export const LEGASI_CORE_PROGRAM_ID = new PublicKey("5Mru5amfomEPqNiEULRuHpgAZyyENqyCeNnkSoh7QjLy");
export const LEGASI_LENDING_PROGRAM_ID = new PublicKey("DGRYqD9Hg9v27Fa9kLUUf3KY9hoprjBQp7y88qG9q88u");
export const LEGASI_LP_PROGRAM_ID = new PublicKey("4g7FgDLuxXJ7fRa57m8SV3gjznMZ9KUjcdJfg1b6BfPF");
export const LEGASI_GAD_PROGRAM_ID = new PublicKey("Ed7pfvjR1mRWmzHP3r1NvukESGr38xZKwpoQ5jGSAVad");

// Token Mints
export const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Mainnet USDC

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
      const position = await (this.lendingProgram.account as any).position.fetch(positionPDA);
      return position as Position;
    } catch (e) {
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
    const [lpPoolPDA] = getLpPoolPDA(USDC_MINT);
    const [priceFeedPDA] = getPriceFeedPDA(SOL_MINT);
    
    const borrowVaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_vault"), USDC_MINT.toBuffer()],
      LEGASI_LP_PROGRAM_ID
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
        borrowVault: borrowVaultPDA,
        userTokenAccount: userUsdcAta,
        solPriceFeed: priceFeedPDA,
        solMint: SOL_MINT,
        owner: this.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return tx;
  }

  // Configure Agent
  async configureAgent(
    dailyLimit: number,
    autoRepay: boolean,
    x402Enabled: boolean
  ): Promise<string> {
    const [positionPDA] = getPositionPDA(this.provider.wallet.publicKey);
    const [agentConfigPDA] = getAgentConfigPDA(positionPDA);
    
    const tx = await this.lendingProgram.methods
      .configureAgent(
        new BN(dailyLimit * 1_000_000), // USDC decimals
        autoRepay,
        x402Enabled,
        7500 // Alert at 75% LTV
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

  // LP Deposit
  async lpDeposit(amount: number): Promise<string> {
    const [lpPoolPDA] = getLpPoolPDA(USDC_MINT);
    
    const lpTokenMintPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_token"), USDC_MINT.toBuffer()],
      LEGASI_LP_PROGRAM_ID
    )[0];
    
    const vaultPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_vault"), USDC_MINT.toBuffer()],
      LEGASI_LP_PROGRAM_ID
    )[0];
    
    const userUsdcAta = await this.findAta(this.provider.wallet.publicKey, USDC_MINT);
    const userLpAta = await this.findAta(this.provider.wallet.publicKey, lpTokenMintPDA);
    
    const usdcAmount = new BN(amount * 1_000_000);
    
    const tx = await this.lpProgram.methods
      .deposit(usdcAmount)
      .accounts({
        lpPool: lpPoolPDA,
        lpTokenMint: lpTokenMintPDA,
        vault: vaultPDA,
        userTokenAccount: userUsdcAta,
        userLpTokenAccount: userLpAta,
        depositor: this.provider.wallet.publicKey,
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
