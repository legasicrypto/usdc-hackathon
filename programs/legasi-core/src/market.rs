//! # Multi-Market Architecture
//!
//! This module provides a flexible multi-market lending system where each market
//! represents a unique collateral/borrowable asset pair with its own risk parameters.
//!
//! ## Key Features
//!
//! - **Multiple Markets**: Each market has unique risk parameters (LTV, liquidation thresholds, interest rates)
//! - **eMode (Efficiency Mode)**: Correlated assets get higher LTV (e.g., BTC/cbBTC up to 93%)
//! - **Dynamic Interest Rates**: Utilization-based interest model with configurable slopes
//! - **Supply/Borrow Caps**: Protocol-level risk management
//!
//! ## eMode Categories
//!
//! - `Stablecoins`: USDC, USDT, EURC (up to 97% LTV)
//! - `SolCorrelated`: SOL (up to 75% LTV)
//! - `BtcCorrelated`: wBTC, cbBTC (up to 93% LTV)
//! - `EthCorrelated`: ETH, stETH, wstETH (up to 93% LTV)
//!
//! ## Usage
//!
//! 1. Admin creates markets with `create_market`
//! 2. Users set their eMode with `set_emode` before borrowing
//! 3. Effective LTV is calculated based on market params + user's eMode
//!
//! ## Security Considerations
//!
//! - eMode can only be changed when user has no active borrows
//! - Supply/borrow caps prevent concentration risk
//! - Each market has independent liquidation parameters

use anchor_lang::prelude::*;
use crate::state::AssetType;

// ========== EMODE CATEGORIES ==========

/// Efficiency Mode categories for correlated assets
/// Higher LTV allowed when collateral and borrow are in same category
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
#[repr(u8)]
pub enum EModeCategory {
    /// No eMode (standard parameters)
    None = 0,
    /// Stablecoins (USDC, USDT, EURC) - highly correlated
    Stablecoins = 1,
    /// ETH ecosystem (ETH, stETH, wstETH, cbETH)
    EthCorrelated = 2,
    /// SOL ecosystem (SOL)
    SolCorrelated = 3,
    /// BTC ecosystem (BTC, wBTC, cbBTC)
    BtcCorrelated = 4,
}

impl Default for EModeCategory {
    fn default() -> Self {
        EModeCategory::None
    }
}

// ========== MARKET CONFIG ==========

/// Market configuration - defines a lending market with specific parameters
/// Each market is a collateral/borrowable pair with unique risk parameters
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Unique market identifier
    pub market_id: u16,
    
    /// Market name (for UI display)
    #[max_len(32)]
    pub name: String,
    
    // === Asset Configuration ===
    
    /// Collateral asset type
    pub collateral_asset: AssetType,
    /// Collateral token mint
    pub collateral_mint: Pubkey,
    
    /// Borrowable asset type
    pub borrow_asset: AssetType,
    /// Borrowable token mint
    pub borrow_mint: Pubkey,
    
    // === Risk Parameters ===
    
    /// Base max LTV (basis points) - without eMode
    pub base_max_ltv_bps: u16,
    /// eMode max LTV (basis points) - when both assets in same category
    pub emode_max_ltv_bps: u16,
    
    /// GAD soft threshold (basis points above max LTV)
    pub gad_soft_threshold_bps: u16,
    /// GAD hard threshold (basis points above max LTV)
    pub gad_hard_threshold_bps: u16,
    
    /// Liquidation bonus (basis points)
    pub liquidation_bonus_bps: u16,
    
    // === Interest Rate Model ===
    
    /// Base interest rate (APY in basis points)
    pub base_interest_rate_bps: u16,
    /// Slope 1 - rate increase per utilization before kink
    pub slope1_bps: u16,
    /// Slope 2 - rate increase per utilization after kink
    pub slope2_bps: u16,
    /// Optimal utilization rate (basis points)
    pub optimal_utilization_bps: u16,
    
    // === eMode Configuration ===
    
    /// eMode category (for correlated asset boost)
    pub emode_category: EModeCategory,
    
    // === Caps & Limits ===
    
    /// Supply cap (max total collateral)
    pub supply_cap: u64,
    /// Borrow cap (max total borrows)
    pub borrow_cap: u64,
    /// Min borrow amount
    pub min_borrow: u64,
    
    // === State ===
    
    /// Is market active
    pub is_active: bool,
    /// Is borrowing enabled
    pub borrow_enabled: bool,
    /// Is collateral enabled
    pub collateral_enabled: bool,
    
    /// Total collateral deposited
    pub total_collateral: u64,
    /// Total borrowed
    pub total_borrowed: u64,
    
    /// Creation timestamp
    pub created_at: i64,
    /// Last update timestamp
    pub updated_at: i64,
    
    pub bump: u8,
}

impl Market {
    /// Calculate effective max LTV based on eMode
    pub fn get_effective_max_ltv(&self, user_emode: EModeCategory) -> u16 {
        if self.emode_category != EModeCategory::None 
            && self.emode_category == user_emode 
        {
            self.emode_max_ltv_bps
        } else {
            self.base_max_ltv_bps
        }
    }
    
    /// Calculate current interest rate based on utilization
    pub fn calculate_interest_rate(&self) -> u16 {
        if self.total_collateral == 0 {
            return self.base_interest_rate_bps;
        }
        
        // Utilization = total_borrowed / total_available
        let utilization_bps = (self.total_borrowed as u128)
            .saturating_mul(10000)
            .checked_div(self.total_collateral as u128)
            .unwrap_or(0) as u16;
        
        if utilization_bps <= self.optimal_utilization_bps {
            // Below kink: base + slope1 * (utilization / optimal)
            let rate_increase = (self.slope1_bps as u32)
                .saturating_mul(utilization_bps as u32)
                .checked_div(self.optimal_utilization_bps as u32)
                .unwrap_or(0) as u16;
            self.base_interest_rate_bps.saturating_add(rate_increase)
        } else {
            // Above kink: base + slope1 + slope2 * ((utilization - optimal) / (1 - optimal))
            let excess_utilization = utilization_bps.saturating_sub(self.optimal_utilization_bps);
            let remaining = 10000u16.saturating_sub(self.optimal_utilization_bps);
            let rate_increase = (self.slope2_bps as u32)
                .saturating_mul(excess_utilization as u32)
                .checked_div(remaining as u32)
                .unwrap_or(0) as u16;
            self.base_interest_rate_bps
                .saturating_add(self.slope1_bps)
                .saturating_add(rate_increase)
        }
    }
    
    /// Check if supply cap allows more deposits
    pub fn can_supply(&self, amount: u64) -> bool {
        if self.supply_cap == 0 {
            return true; // No cap
        }
        self.total_collateral.saturating_add(amount) <= self.supply_cap
    }
    
    /// Check if borrow cap allows more borrows
    pub fn can_borrow(&self, amount: u64) -> bool {
        if !self.borrow_enabled {
            return false;
        }
        if self.borrow_cap == 0 {
            return true; // No cap
        }
        self.total_borrowed.saturating_add(amount) <= self.borrow_cap
    }
}

// ========== MARKET PRESETS ==========

/// Predefined market configurations
pub struct MarketPreset;

impl MarketPreset {
    /// SOL/USDC - Main market
    pub fn sol_usdc() -> MarketParams {
        MarketParams {
            name: "SOL/USDC".to_string(),
            base_max_ltv_bps: 7500,       // 75%
            emode_max_ltv_bps: 7500,      // No eMode boost
            gad_soft_threshold_bps: 500,  // GAD at 80%
            gad_hard_threshold_bps: 1500, // Hard at 90%
            liquidation_bonus_bps: 500,   // 5%
            base_interest_rate_bps: 200,  // 2%
            slope1_bps: 400,              // 4%
            slope2_bps: 7500,             // 75%
            optimal_utilization_bps: 8000, // 80%
            emode_category: EModeCategory::None,
            supply_cap: 0,
            borrow_cap: 0,
            min_borrow: 1_000_000, // $1 USDC
        }
    }
    
    /// USDC/USDT - Stablecoin eMode
    pub fn usdc_usdt_emode() -> MarketParams {
        MarketParams {
            name: "USDC/USDT eMode".to_string(),
            base_max_ltv_bps: 9000,       // 90% base
            emode_max_ltv_bps: 9700,      // 97% with eMode!
            gad_soft_threshold_bps: 100,  // Very tight
            gad_hard_threshold_bps: 300,
            liquidation_bonus_bps: 100,   // Minimal bonus
            base_interest_rate_bps: 50,   // Very low rates
            slope1_bps: 100,
            slope2_bps: 3000,
            optimal_utilization_bps: 9500,
            emode_category: EModeCategory::Stablecoins,
            supply_cap: 0,
            borrow_cap: 0,
            min_borrow: 1_000_000,
        }
    }
    
    /// cbBTC/USDC - Bitcoin market
    pub fn cbbtc_usdc() -> MarketParams {
        MarketParams {
            name: "cbBTC/USDC".to_string(),
            base_max_ltv_bps: 7500,
            emode_max_ltv_bps: 7500,
            gad_soft_threshold_bps: 500,
            gad_hard_threshold_bps: 1500,
            liquidation_bonus_bps: 500,
            base_interest_rate_bps: 200,
            slope1_bps: 400,
            slope2_bps: 7500,
            optimal_utilization_bps: 8000,
            emode_category: EModeCategory::BtcCorrelated,
            supply_cap: 0,
            borrow_cap: 0,
            min_borrow: 1_000_000,
        }
    }
}

/// Parameters for creating a new market
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MarketParams {
    pub name: String,
    pub base_max_ltv_bps: u16,
    pub emode_max_ltv_bps: u16,
    pub gad_soft_threshold_bps: u16,
    pub gad_hard_threshold_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub base_interest_rate_bps: u16,
    pub slope1_bps: u16,
    pub slope2_bps: u16,
    pub optimal_utilization_bps: u16,
    pub emode_category: EModeCategory,
    pub supply_cap: u64,
    pub borrow_cap: u64,
    pub min_borrow: u64,
}

// ========== USER EMODE ==========

/// User's eMode selection (stored in Position or separate account)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct UserEMode {
    /// Selected eMode category
    pub category: EModeCategory,
    /// Timestamp when eMode was entered
    pub entered_at: i64,
}

impl UserEMode {
    pub fn is_active(&self) -> bool {
        self.category != EModeCategory::None
    }
}
