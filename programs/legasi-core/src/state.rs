use anchor_lang::prelude::*;

/// Supported collateral asset types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
#[repr(u8)]
pub enum AssetType {
    SOL = 0,
    USDC = 1,
    USDT = 2,
    CbBTC = 3,    // Coinbase wrapped BTC
    JitoSOL = 4,  // Jito staked SOL
    MSOL = 5,     // Marinade staked SOL
    EURC = 6,     // Euro stablecoin
}

/// Protocol global state
#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub insurance_fund: u64,
    pub total_collateral_usd: u64,
    pub total_borrowed_usd: u64,
    pub paused: bool,
    pub bump: u8,
}

/// Collateral asset configuration
#[account]
#[derive(InitSpace)]
pub struct Collateral {
    pub mint: Pubkey,
    pub oracle: Pubkey,
    pub max_ltv_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub decimals: u8,
    pub is_active: bool,
    pub total_deposited: u64,
    pub asset_type: AssetType,
    pub bump: u8,
}

/// Borrowable asset configuration
#[account]
#[derive(InitSpace)]
pub struct Borrowable {
    pub mint: Pubkey,
    pub oracle: Pubkey,
    pub interest_rate_bps: u16,
    pub decimals: u8,
    pub is_active: bool,
    pub total_borrowed: u64,
    pub total_available: u64,
    pub asset_type: AssetType,
    pub bump: u8,
}

/// Price feed (temporary - will use Pyth/Chainlink in prod)
#[account]
#[derive(InitSpace)]
pub struct PriceFeed {
    pub asset_type: AssetType,
    pub price_usd_6dec: u64,
    pub last_update: i64,
    pub confidence: u64,
    pub bump: u8,
}

/// User lending position (multi-collateral, multi-borrow)
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    #[max_len(8)]
    pub collaterals: Vec<CollateralDeposit>,
    #[max_len(4)]
    pub borrows: Vec<BorrowedAmount>,
    pub last_update: i64,
    pub last_gad_crank: i64,
    pub gad_enabled: bool,
    pub total_gad_liquidated_usd: u64,
    pub reputation: Reputation,
    pub bump: u8,
}

/// Single collateral deposit entry
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct CollateralDeposit {
    pub asset_type: AssetType,
    pub amount: u64,
}

/// Single borrow entry
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct BorrowedAmount {
    pub asset_type: AssetType,
    pub amount: u64,
    pub accrued_interest: u64,
}

/// On-chain reputation score
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct Reputation {
    pub successful_repayments: u32,
    pub total_repaid_usd: u64,
    pub gad_events: u32,
    pub account_age_days: u32,
}

impl Reputation {
    pub fn get_score(&self) -> u32 {
        let base = std::cmp::min(self.successful_repayments * 50, 500);
        let age_bonus = std::cmp::min(self.account_age_days / 30 * 10, 100);
        base.saturating_add(age_bonus).saturating_sub(self.gad_events * 100)
    }

    /// Returns LTV bonus in basis points based on reputation
    pub fn get_ltv_bonus_bps(&self) -> u16 {
        match self.get_score() {
            s if s >= 400 => 500,  // +5% LTV
            s if s >= 200 => 300,  // +3% LTV
            s if s >= 100 => 100,  // +1% LTV
            _ => 0,
        }
    }
}

/// LP pool for a borrowable asset
#[account]
#[derive(InitSpace)]
pub struct LpPool {
    pub borrowable_mint: Pubkey,
    pub lp_token_mint: Pubkey,
    pub total_deposits: u64,
    pub total_shares: u64,
    pub total_borrowed: u64,
    pub interest_earned: u64,
    pub bump: u8,
}
