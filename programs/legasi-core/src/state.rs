use anchor_lang::prelude::*;

/// Supported asset types
/// Collaterals: SOL, cbBTC
/// Borrowables: USDC, EURC
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
#[repr(u8)]
pub enum AssetType {
    // Collaterals
    SOL = 0,   // Native SOL
    CbBTC = 1, // Coinbase wrapped BTC
    // Borrowables
    USDC = 2, // USD Coin
    EURC = 3, // Euro Coin
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
        base.saturating_add(age_bonus)
            .saturating_sub(self.gad_events * 100)
    }

    /// Returns LTV bonus in basis points based on reputation
    pub fn get_ltv_bonus_bps(&self) -> u16 {
        match self.get_score() {
            s if s >= 400 => 500, // +5% LTV
            s if s >= 200 => 300, // +3% LTV
            s if s >= 100 => 100, // +1% LTV
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

/// Agent-specific position for x402 and autonomous operations
/// Extends the base Position with agent-specific features
#[account]
#[derive(InitSpace)]
pub struct AgentConfig {
    /// The position this config extends
    pub position: Pubkey,
    /// Human operator (can intervene if needed)
    pub operator: Pubkey,
    /// Maximum USDC that can be borrowed per day
    pub daily_borrow_limit: u64,
    /// Amount borrowed in current period
    pub daily_borrowed: u64,
    /// Period reset timestamp
    pub period_start: i64,
    /// Auto-repay incoming USDC to reduce debt
    pub auto_repay_enabled: bool,
    /// x402 payment endpoint enabled
    pub x402_enabled: bool,
    /// Webhook URL for low balance alerts (stored off-chain, this is just a flag)
    pub alerts_enabled: bool,
    /// Minimum collateral ratio before alert (in bps)
    pub alert_threshold_bps: u16,
    pub bump: u8,
}

impl AgentConfig {
    /// Check if agent can borrow more today
    pub fn can_borrow(&self, amount: u64, current_time: i64) -> bool {
        // Reset daily limit if new period
        let seconds_per_day: i64 = 86400;
        if current_time - self.period_start >= seconds_per_day {
            return amount <= self.daily_borrow_limit;
        }

        self.daily_borrowed.saturating_add(amount) <= self.daily_borrow_limit
    }

    /// Record a borrow against daily limit
    pub fn record_borrow(&mut self, amount: u64, current_time: i64) {
        let seconds_per_day: i64 = 86400;
        if current_time - self.period_start >= seconds_per_day {
            self.period_start = current_time;
            self.daily_borrowed = amount;
        } else {
            self.daily_borrowed = self.daily_borrowed.saturating_add(amount);
        }
    }
}
