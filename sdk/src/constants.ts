import { PublicKey } from '@solana/web3.js';

/**
 * Legasi Program IDs
 */
export const PROGRAM_IDS = {
  /** Core protocol state and configuration */
  CORE: new PublicKey('4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy'),
  /** Lending operations (deposit, borrow, repay) */
  LENDING: new PublicKey('11111111111111111111111111111111'), // TODO: deploy
  /** LP pools */
  LP: new PublicKey('CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY'),
  /** Gradual Auto-Deleveraging */
  GAD: new PublicKey('89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK'),
  /** Flash loans */
  FLASH: new PublicKey('Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m'),
  /** One-click leverage */
  LEVERAGE: new PublicKey('11111111111111111111111111111111'), // TODO: deploy
} as const;

/**
 * Well-known token mints
 */
export const MINTS = {
  /** Wrapped SOL */
  WSOL: new PublicKey('So11111111111111111111111111111111111111112'),
  /** USDC (devnet) */
  USDC: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  /** USDT (devnet) */
  USDT: new PublicKey('EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS'),
} as const;

/**
 * PDA Seeds
 */
export const SEEDS = {
  PROTOCOL: 'protocol',
  POSITION: 'position',
  COLLATERAL: 'collateral',
  PRICE: 'price',
  AGENT_CONFIG: 'agent_config',
  GAD_CONFIG: 'gad_config',
  LP_POOL: 'lp_pool',
  LP_TOKEN: 'lp_token',
  LP_VAULT: 'lp_vault',
  FLASH: 'flash',
  SOL_VAULT: 'sol_vault',
} as const;

/**
 * Default values
 */
export const DEFAULTS = {
  /** Default max LTV for SOL collateral (75%) */
  SOL_MAX_LTV_BPS: 7500,
  /** Default liquidation threshold (85%) */
  LIQUIDATION_THRESHOLD_BPS: 8500,
  /** Default liquidation penalty (5%) */
  LIQUIDATION_PENALTY_BPS: 500,
  /** Flash loan fee (0.09%) */
  FLASH_FEE_BPS: 9,
  /** GAD start threshold (80% LTV) */
  GAD_START_THRESHOLD_BPS: 8000,
  /** GAD step size (5% per step) */
  GAD_STEP_SIZE_BPS: 500,
  /** GAD minimum interval (1 hour) */
  GAD_MIN_INTERVAL_SECONDS: 3600,
  /** Default slippage for swaps (1%) */
  SLIPPAGE_BPS: 100,
} as const;

/**
 * Reputation thresholds
 */
export const REPUTATION = {
  /** Points per successful repayment */
  POINTS_PER_REPAYMENT: 50,
  /** Maximum points from repayments */
  MAX_REPAYMENT_POINTS: 500,
  /** Points deducted per GAD event */
  GAD_PENALTY: 100,
  /** LTV bonus threshold (score >= 400) */
  BONUS_THRESHOLD_HIGH: 400,
  /** LTV bonus for high reputation (5%) */
  BONUS_HIGH_BPS: 500,
  /** LTV bonus threshold (score >= 200) */
  BONUS_THRESHOLD_MED: 200,
  /** LTV bonus for medium reputation (3%) */
  BONUS_MED_BPS: 300,
} as const;

/**
 * Network configurations
 */
export const NETWORKS = {
  DEVNET: {
    rpcUrl: 'https://api.devnet.solana.com',
    wsUrl: 'wss://api.devnet.solana.com',
  },
  MAINNET: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    wsUrl: 'wss://api.mainnet-beta.solana.com',
  },
} as const;

/**
 * Decimals for common tokens
 */
export const DECIMALS = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  /** Price feeds use 6 decimals */
  USD: 6,
} as const;
