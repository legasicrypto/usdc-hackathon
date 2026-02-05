import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

/**
 * Position state from on-chain
 */
export interface Position {
  owner: PublicKey;
  collateralSol: BN;
  collateralSpl: BN;
  collateralMint: PublicKey | null;
  debtAmount: BN;
  debtMint: PublicKey | null;
  lastUpdate: BN;
  reputationScore: number;
  successfulRepayments: number;
  totalVolumeRepaid: BN;
  gadEvents: number;
  bump: number;
}

/**
 * Agent configuration for autonomous operations
 */
export interface AgentConfigData {
  position: PublicKey;
  dailyBorrowLimit: BN;
  dailyBorrowUsed: BN;
  lastResetDay: BN;
  autoRepayEnabled: boolean;
  autoRepayThresholdBps: number;
  x402Enabled: boolean;
  x402DailyLimit: BN;
  x402DailyUsed: BN;
  alertThresholdBps: number;
  bump: number;
}

/**
 * GAD (Gradual Auto-Deleveraging) configuration
 */
export interface GadConfigData {
  position: PublicKey;
  enabled: boolean;
  startThresholdBps: number;
  stepSizeBps: number;
  minIntervalSeconds: number;
  lastExecutionTime: BN;
  totalStepsExecuted: number;
  totalAmountDeleveraged: BN;
  bump: number;
}

/**
 * LP Pool state
 */
export interface LpPool {
  borrowableMint: PublicKey;
  lpTokenMint: PublicKey;
  vault: PublicKey;
  totalDeposits: BN;
  totalBorrowed: BN;
  lastAccrualTime: BN;
  accumulatedInterest: BN;
  admin: PublicKey;
  bump: number;
}

/**
 * Collateral asset configuration
 */
export interface CollateralConfig {
  mint: PublicKey;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationPenaltyBps: number;
  active: boolean;
}

/**
 * Price feed data
 */
export interface PriceFeed {
  mint: PublicKey;
  priceUsd6dec: BN;
  lastUpdate: BN;
  confidence: BN;
}

/**
 * Health status of a position
 */
export interface HealthStatus {
  ltv: number;
  healthFactor: number;
  liquidationPrice: number | null;
  collateralValueUsd: number;
  debtValueUsd: number;
  availableToBorrow: number;
  isHealthy: boolean;
  gadActive: boolean;
}

/**
 * Transaction result
 */
export interface TxResult {
  signature: string;
  success: boolean;
  error?: string;
}

/**
 * Borrow parameters
 */
export interface BorrowParams {
  amount: number | BN;
  mint: PublicKey;
  /** Optional: use agent config for autonomous borrowing */
  asAgent?: boolean;
}

/**
 * Repay parameters
 */
export interface RepayParams {
  amount: number | BN;
  mint: PublicKey;
  /** Repay full debt */
  full?: boolean;
}

/**
 * Leverage parameters
 */
export interface LeverageParams {
  /** Initial collateral amount */
  collateralAmount: number;
  /** Target leverage multiplier (e.g., 3 for 3x) */
  leverage: number;
  /** 'long' or 'short' */
  direction: 'long' | 'short';
  /** Slippage tolerance in bps */
  slippageBps?: number;
}

/**
 * Flash loan parameters
 */
export interface FlashLoanParams {
  amount: number | BN;
  mint: PublicKey;
  /** Instructions to execute between borrow and repay */
  innerInstructions: any[];
}

/**
 * Agent alert
 */
export interface AgentAlert {
  type: 'ltv_warning' | 'gad_triggered' | 'daily_limit_reached' | 'auto_repay';
  message: string;
  timestamp: Date;
  data?: any;
}

/**
 * Callback for agent alerts
 */
export type AlertCallback = (alert: AgentAlert) => void | Promise<void>;
