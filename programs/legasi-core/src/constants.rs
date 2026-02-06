/// Basis points denominator (100% = 10000)
pub const BPS_DENOMINATOR: u64 = 10000;

/// USD decimals (6)
pub const USD_DECIMALS: u8 = 6;
pub const USD_MULTIPLIER: u64 = 1_000_000;

/// SOL decimals (9)
pub const SOL_DECIMALS: u8 = 9;
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// Default max LTV for collateral assets (basis points)
/// Accepted collaterals: SOL, cbBTC
pub const DEFAULT_SOL_MAX_LTV_BPS: u16 = 7500; // 75%
pub const DEFAULT_BTC_MAX_LTV_BPS: u16 = 7500; // 75%

/// GAD thresholds (basis points above max LTV)
pub const GAD_SOFT_THRESHOLD_BPS: u16 = 500; // 5% above max LTV = soft deleverage
pub const GAD_HARD_THRESHOLD_BPS: u16 = 1500; // 15% above max LTV = aggressive deleverage

/// GAD rates (basis points per day)
pub const GAD_SOFT_RATE_BPS: u64 = 10; // 0.1% per day
pub const GAD_MEDIUM_RATE_BPS: u64 = 100; // 1% per day
pub const GAD_HARD_RATE_BPS: u64 = 1000; // 10% per day

/// Minimum time between GAD cranks (seconds)
pub const MIN_GAD_CRANK_INTERVAL: i64 = 3600; // 1 hour

/// Seconds per day
pub const SECONDS_PER_DAY: i64 = 86400;

/// Insurance fund fee (basis points of interest)
pub const INSURANCE_FEE_BPS: u64 = 500; // 5%

/// Flash loan fee (basis points)
pub const FLASH_LOAN_FEE_BPS: u64 = 5; // 0.05%

/// Minimum flash loan fee (absolute)
pub const MIN_FLASH_LOAN_FEE: u64 = 1;

/// Cranker reward (basis points of liquidated amount)
pub const CRANKER_REWARD_BPS: u64 = 50; // 0.5%

/// Price feed staleness threshold (seconds)
pub const PRICE_STALENESS_THRESHOLD: i64 = 300; // 5 minutes

/// Max collateral types per position
pub const MAX_COLLATERAL_TYPES: usize = 8;

/// Max borrow types per position
pub const MAX_BORROW_TYPES: usize = 4;

// ========== TOKEN MINTS (Devnet) ==========

/// Native SOL (wrapped)
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";

/// USDC (devnet)
pub const USDC_MINT_DEVNET: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/// cbBTC (Coinbase wrapped BTC) - mainnet
pub const CBBTC_MINT_MAINNET: &str = "cbBTC111111111111111111111111111111111111111"; // Placeholder
