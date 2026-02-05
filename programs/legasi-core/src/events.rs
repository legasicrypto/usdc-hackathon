use crate::state::AssetType;
use anchor_lang::prelude::*;

#[event]
pub struct ProtocolInitialized {
    pub admin: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct CollateralRegistered {
    pub mint: Pubkey,
    pub asset_type: AssetType,
    pub max_ltv_bps: u16,
}

#[event]
pub struct BorrowableRegistered {
    pub mint: Pubkey,
    pub asset_type: AssetType,
    pub interest_rate_bps: u16,
}

#[event]
pub struct PositionCreated {
    pub owner: Pubkey,
    pub position: Pubkey,
}

#[event]
pub struct CollateralDeposited {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub asset_type: AssetType,
    pub amount: u64,
    pub total_collateral_usd: u64,
}

#[event]
pub struct CollateralWithdrawn {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub asset_type: AssetType,
    pub amount: u64,
}

#[event]
pub struct Borrowed {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub asset_type: AssetType,
    pub amount: u64,
    pub new_ltv_bps: u64,
}

#[event]
pub struct Repaid {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub asset_type: AssetType,
    pub amount: u64,
    pub interest_paid: u64,
}

#[event]
pub struct GadExecuted {
    pub position: Pubkey,
    pub collateral_liquidated_usd: u64,
    pub debt_reduced_usd: u64,
    pub ltv_before_bps: u64,
    pub ltv_after_bps: u64,
    pub gad_rate_bps: u64,
    pub cranker: Pubkey,
    pub cranker_reward: u64,
}

#[event]
pub struct LpDeposited {
    pub depositor: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub shares_minted: u64,
}

#[event]
pub struct LpWithdrawn {
    pub withdrawer: Pubkey,
    pub pool: Pubkey,
    pub shares_burned: u64,
    pub amount_received: u64,
}

#[event]
pub struct FlashLoanInitiated {
    pub borrower: Pubkey,
    pub asset_type: AssetType,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct FlashLoanRepaid {
    pub borrower: Pubkey,
    pub asset_type: AssetType,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct LeverageOpened {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub collateral_type: AssetType,
    pub borrow_type: AssetType,
    pub initial_collateral: u64,
    pub total_collateral: u64,
    pub total_borrowed: u64,
    pub leverage_multiplier: u8,
}

#[event]
pub struct LeverageClosed {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub collateral_returned: u64,
    pub pnl_usd: i64,
}

#[event]
pub struct PriceUpdated {
    pub asset_type: AssetType,
    pub price_usd_6dec: u64,
    pub timestamp: i64,
}

// ========== MULTI-MARKET EVENTS ==========

#[event]
pub struct MarketCreated {
    pub market_id: u16,
    pub name: String,
    pub collateral_asset: AssetType,
    pub borrow_asset: AssetType,
    pub base_max_ltv_bps: u16,
    pub emode_max_ltv_bps: u16,
}

#[event]
pub struct MarketUpdated {
    pub market_id: u16,
    pub base_max_ltv_bps: u16,
    pub emode_max_ltv_bps: u16,
    pub supply_cap: u64,
    pub borrow_cap: u64,
}

#[event]
pub struct MarketToggled {
    pub market_id: u16,
    pub is_active: bool,
    pub borrow_enabled: bool,
    pub collateral_enabled: bool,
}

#[event]
pub struct EModeSet {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub old_category: u8,
    pub new_category: u8,
}
