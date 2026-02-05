use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// Import only read-only types from core (not Position, AgentConfig, etc. which are init'ed here)
use legasi_core::{
    constants::*,
    errors::LegasiError,
    state::{Protocol, Borrowable, Collateral, PriceFeed, AssetType, LpPool},
};

pub mod x402;
pub use x402::*;

declare_id!("9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw");

// ========== LOCAL STATE (owned by this program) ==========
// These structs are defined here (not imported from core) to ensure proper PDA ownership

/// User lending position
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

/// Agent configuration for autonomous operations
#[account]
#[derive(InitSpace)]
pub struct AgentConfig {
    pub position: Pubkey,
    pub operator: Pubkey,
    pub daily_borrow_limit: u64,
    pub daily_borrowed: u64,
    pub period_start: i64,
    pub auto_repay_enabled: bool,
    pub x402_enabled: bool,
    pub alerts_enabled: bool,
    pub alert_threshold_bps: u16,
    pub bump: u8,
}

impl AgentConfig {
    /// Check if agent can borrow more today
    pub fn can_borrow(&self, amount: u64, current_time: i64) -> bool {
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

/// X402 payment receipt
#[account]
#[derive(InitSpace)]
pub struct X402Receipt {
    pub payment_id: [u8; 32],
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub paid_at: i64,
    pub tx_signature: [u8; 64],
    pub bump: u8,
}

#[program]
pub mod legasi_lending {
    use super::*;

    /// Initialize the lending vault for a borrowable asset
    pub fn initialize_lending_vault(_ctx: Context<InitializeLendingVault>) -> Result<()> {
        msg!("Lending vault initialized");
        Ok(())
    }

    /// Initialize a user position
    pub fn initialize_position(ctx: Context<InitializePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.collaterals = Vec::new();
        position.borrows = Vec::new();
        position.last_update = Clock::get()?.unix_timestamp;
        position.last_gad_crank = Clock::get()?.unix_timestamp;
        position.gad_enabled = true;
        position.total_gad_liquidated_usd = 0;
        position.reputation = Reputation::default();
        position.bump = ctx.bumps.position;

        msg!("Position initialized for {}", ctx.accounts.owner.key());
        Ok(())
    }

    /// Deposit SOL as collateral
    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);

        invoke(
            &system_instruction::transfer(
                ctx.accounts.owner.key,
                ctx.accounts.sol_vault.key,
                amount,
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let position = &mut ctx.accounts.position;

        // Find or create SOL deposit
        let mut found = false;
        for deposit in position.collaterals.iter_mut() {
            if deposit.asset_type == AssetType::SOL {
                deposit.amount = deposit
                    .amount
                    .checked_add(amount)
                    .ok_or(LegasiError::MathOverflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(
                position.collaterals.len() < MAX_COLLATERAL_TYPES,
                LegasiError::MaxCollateralTypesReached
            );
            position.collaterals.push(CollateralDeposit {
                asset_type: AssetType::SOL,
                amount,
            });
        }

        position.last_update = Clock::get()?.unix_timestamp;
        msg!("Deposited {} lamports", amount);
        Ok(())
    }

    /// Deposit SPL token as collateral (cbBTC)
    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);
        require!(
            ctx.accounts.collateral_config.is_active,
            LegasiError::AssetNotActive
        );

        let asset_type = ctx.accounts.collateral_config.asset_type;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        let position = &mut ctx.accounts.position;

        let mut found = false;
        for deposit in position.collaterals.iter_mut() {
            if deposit.asset_type == asset_type {
                deposit.amount = deposit
                    .amount
                    .checked_add(amount)
                    .ok_or(LegasiError::MathOverflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(
                position.collaterals.len() < MAX_COLLATERAL_TYPES,
                LegasiError::MaxCollateralTypesReached
            );
            position
                .collaterals
                .push(CollateralDeposit { asset_type, amount });
        }

        position.last_update = Clock::get()?.unix_timestamp;

        let collateral_config = &mut ctx.accounts.collateral_config;
        collateral_config.total_deposited = collateral_config
            .total_deposited
            .checked_add(amount)
            .ok_or(LegasiError::MathOverflow)?;

        msg!("Deposited {} {:?}", amount, asset_type);
        Ok(())
    }

    /// Borrow stablecoins (USDC, EURC)
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);
        require!(
            ctx.accounts.borrowable_config.is_active,
            LegasiError::AssetNotActive
        );
        require!(
            ctx.accounts.borrow_vault.amount >= amount,
            LegasiError::InsufficientLiquidity
        );

        let asset_type = ctx.accounts.borrowable_config.asset_type;
        let sol_price = ctx.accounts.sol_price_feed.price_usd_6dec;

        // Calculate collateral value
        let mut total_collateral_usd: u64 = 0;
        for deposit in &ctx.accounts.position.collaterals {
            if deposit.asset_type == AssetType::SOL || deposit.asset_type == AssetType::CbBTC {
                let value = (deposit.amount as u128)
                    .checked_mul(sol_price as u128)
                    .ok_or(LegasiError::MathOverflow)?
                    .checked_div(LAMPORTS_PER_SOL as u128)
                    .ok_or(LegasiError::MathOverflow)? as u64;
                total_collateral_usd = total_collateral_usd
                    .checked_add(value)
                    .ok_or(LegasiError::MathOverflow)?;
            }
        }

        // Calculate borrow value
        let mut current_borrow_usd: u64 = 0;
        for borrow in &ctx.accounts.position.borrows {
            let value = borrow
                .amount
                .checked_add(borrow.accrued_interest)
                .ok_or(LegasiError::MathOverflow)?;
            current_borrow_usd = current_borrow_usd
                .checked_add(value)
                .ok_or(LegasiError::MathOverflow)?;
        }
        let new_borrow_usd = current_borrow_usd
            .checked_add(amount)
            .ok_or(LegasiError::MathOverflow)?;

        // Check LTV
        let base_ltv = DEFAULT_SOL_MAX_LTV_BPS as u64;
        let reputation_bonus = ctx.accounts.position.reputation.get_ltv_bonus_bps() as u64;
        let effective_max_ltv = base_ltv.saturating_add(reputation_bonus);

        let max_borrow = total_collateral_usd
            .checked_mul(effective_max_ltv)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(LegasiError::MathOverflow)?;

        require!(new_borrow_usd <= max_borrow, LegasiError::ExceedsLTV);

        // Transfer tokens from lending vault
        let mint = ctx.accounts.borrowable_config.mint;
        let vault_bump = ctx.bumps.borrow_vault;
        let seeds: &[&[u8]] = &[b"lending_vault", mint.as_ref(), &[vault_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.borrow_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.borrow_vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        // Update position
        let position = &mut ctx.accounts.position;

        let mut found = false;
        for borrow in position.borrows.iter_mut() {
            if borrow.asset_type == asset_type {
                borrow.amount = borrow
                    .amount
                    .checked_add(amount)
                    .ok_or(LegasiError::MathOverflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(
                position.borrows.len() < MAX_BORROW_TYPES,
                LegasiError::MaxBorrowTypesReached
            );
            position.borrows.push(BorrowedAmount {
                asset_type,
                amount,
                accrued_interest: 0,
            });
        }

        position.last_update = Clock::get()?.unix_timestamp;
        msg!("Borrowed {} {:?}", amount, asset_type);
        Ok(())
    }

    /// Repay borrowed amount
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);

        let asset_type = ctx.accounts.borrowable_config.asset_type;

        // Find borrow
        let mut total_owed: u64 = 0;
        for borrow in &ctx.accounts.position.borrows {
            if borrow.asset_type == asset_type {
                total_owed = borrow
                    .amount
                    .checked_add(borrow.accrued_interest)
                    .ok_or(LegasiError::MathOverflow)?;
                break;
            }
        }
        require!(total_owed > 0, LegasiError::PositionNotFound);

        let repay_amount = std::cmp::min(amount, total_owed);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.repay_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            repay_amount,
        )?;

        // Update position
        let position = &mut ctx.accounts.position;

        for borrow in position.borrows.iter_mut() {
            if borrow.asset_type == asset_type {
                let interest_payment = std::cmp::min(repay_amount, borrow.accrued_interest);
                borrow.accrued_interest = borrow.accrued_interest.saturating_sub(interest_payment);
                let principal = repay_amount.saturating_sub(interest_payment);
                borrow.amount = borrow.amount.saturating_sub(principal);
                break;
            }
        }

        // Remove empty borrows
        position
            .borrows
            .retain(|b| b.amount > 0 || b.accrued_interest > 0);

        position.reputation.successful_repayments =
            position.reputation.successful_repayments.saturating_add(1);
        position.reputation.total_repaid_usd = position
            .reputation
            .total_repaid_usd
            .saturating_add(repay_amount);
        position.last_update = Clock::get()?.unix_timestamp;

        msg!("Repaid {} {:?}", repay_amount, asset_type);
        Ok(())
    }

    /// Withdraw SOL collateral
    pub fn withdraw_sol(ctx: Context<WithdrawSol>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);

        let sol_price = ctx.accounts.sol_price_feed.price_usd_6dec;

        // Find SOL deposit
        let mut sol_amount: u64 = 0;
        for deposit in &ctx.accounts.position.collaterals {
            if deposit.asset_type == AssetType::SOL {
                sol_amount = deposit.amount;
                break;
            }
        }
        require!(sol_amount >= amount, LegasiError::InsufficientCollateral);

        // Check LTV after withdrawal if has borrows
        if !ctx.accounts.position.borrows.is_empty() {
            let remaining = sol_amount
                .checked_sub(amount)
                .ok_or(LegasiError::MathOverflow)?;
            let remaining_value = (remaining as u128)
                .checked_mul(sol_price as u128)
                .ok_or(LegasiError::MathOverflow)?
                .checked_div(LAMPORTS_PER_SOL as u128)
                .ok_or(LegasiError::MathOverflow)? as u64;

            let mut total_borrow: u64 = 0;
            for borrow in &ctx.accounts.position.borrows {
                total_borrow = total_borrow
                    .checked_add(borrow.amount)
                    .ok_or(LegasiError::MathOverflow)?;
                total_borrow = total_borrow
                    .checked_add(borrow.accrued_interest)
                    .ok_or(LegasiError::MathOverflow)?;
            }

            let max_borrow = remaining_value
                .checked_mul(DEFAULT_SOL_MAX_LTV_BPS as u64)
                .ok_or(LegasiError::MathOverflow)?
                .checked_div(BPS_DENOMINATOR)
                .ok_or(LegasiError::MathOverflow)?;

            require!(total_borrow <= max_borrow, LegasiError::ExceedsLTV);
        }

        // Transfer SOL
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.sol_vault;
        let seeds: &[&[u8]] = &[b"sol_vault", position_key.as_ref(), &[vault_bump]];

        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.sol_vault.key,
                ctx.accounts.owner.key,
                amount,
            ),
            &[
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;

        // Update position
        let position = &mut ctx.accounts.position;

        for deposit in position.collaterals.iter_mut() {
            if deposit.asset_type == AssetType::SOL {
                deposit.amount = deposit.amount.saturating_sub(amount);
                break;
            }
        }
        position.collaterals.retain(|c| c.amount > 0);
        position.last_update = Clock::get()?.unix_timestamp;

        msg!("Withdrew {} lamports", amount);
        Ok(())
    }

    /// Accrue interest on a position's borrows
    /// Can be called by anyone (cranker) to update interest
    pub fn accrue_position_interest(ctx: Context<AccruePositionInterest>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.saturating_sub(position.last_update);

        // Skip if updated recently (< 1 hour)
        if elapsed < 3600 {
            return Ok(());
        }

        for borrow in position.borrows.iter_mut() {
            // Get interest rate for this asset (from borrowable config)
            let annual_rate_bps = match borrow.asset_type {
                AssetType::USDC => 800, // 8% APR
                AssetType::EURC => 700, // 7% APR
                _ => 0,
            };

            if annual_rate_bps == 0 || borrow.amount == 0 {
                continue;
            }

            // Calculate interest: principal * rate * time / year
            // Using seconds: interest = amount * rate_bps * elapsed / (365.25 * 24 * 3600 * 10000)
            let seconds_per_year: u128 = 31_557_600; // 365.25 days
            let interest = (borrow.amount as u128)
                .checked_mul(annual_rate_bps as u128)
                .unwrap_or(0)
                .checked_mul(elapsed as u128)
                .unwrap_or(0)
                .checked_div(seconds_per_year)
                .unwrap_or(0)
                .checked_div(BPS_DENOMINATOR as u128)
                .unwrap_or(0) as u64;

            borrow.accrued_interest = borrow.accrued_interest.saturating_add(interest);
        }

        position.last_update = now;

        msg!("Interest accrued for position");
        Ok(())
    }

    /// Off-ramp borrowed stablecoins via Bridge.xyz
    /// Burns the borrowed tokens and initiates fiat transfer
    pub fn offramp_via_bridge(
        ctx: Context<OfframpViaBridge>,
        request_id: u64, // Unique request ID for PDA
        amount: u64,
        destination_iban: String, // Bank account IBAN
        destination_name: String, // Recipient name
    ) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);
        require!(destination_iban.len() > 10, LegasiError::InvalidAmount); // Basic IBAN validation

        // Check user has borrowed this amount
        let position = &ctx.accounts.position;
        let mut borrowed_amount: u64 = 0;
        for borrow in &position.borrows {
            if borrow.asset_type == AssetType::USDC || borrow.asset_type == AssetType::EURC {
                borrowed_amount = borrowed_amount.saturating_add(borrow.amount);
            }
        }
        require!(
            borrowed_amount >= amount,
            LegasiError::InsufficientLiquidity
        );

        // Burn tokens from user's account
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.stablecoin_mint.to_account_info(),
                    from: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        // Create off-ramp request record
        let offramp = &mut ctx.accounts.offramp_request;
        offramp.owner = ctx.accounts.owner.key();
        offramp.amount = amount;
        offramp.destination_iban = destination_iban.clone();
        offramp.destination_name = destination_name.clone();
        offramp.status = OfframpStatus::Pending;
        offramp.created_at = Clock::get()?.unix_timestamp;
        offramp.bump = ctx.bumps.offramp_request;

        emit!(OfframpRequested {
            owner: ctx.accounts.owner.key(),
            amount,
            destination_iban,
            asset_type: AssetType::USDC, // TODO: detect from mint
        });

        msg!(
            "Off-ramp requested: {} USDC to {}",
            amount,
            destination_name
        );
        Ok(())
    }

    // ========== AGENT FUNCTIONS ==========

    /// Configure agent settings for a position
    /// Only the position owner can call this
    pub fn configure_agent(
        ctx: Context<ConfigureAgent>,
        daily_borrow_limit: u64,
        auto_repay_enabled: bool,
        x402_enabled: bool,
        alert_threshold_bps: u16,
    ) -> Result<()> {
        let agent_config = &mut ctx.accounts.agent_config;
        agent_config.position = ctx.accounts.position.key();
        agent_config.operator = ctx.accounts.owner.key();
        agent_config.daily_borrow_limit = daily_borrow_limit;
        agent_config.daily_borrowed = 0;
        agent_config.period_start = Clock::get()?.unix_timestamp;
        agent_config.auto_repay_enabled = auto_repay_enabled;
        agent_config.x402_enabled = x402_enabled;
        agent_config.alerts_enabled = true;
        agent_config.alert_threshold_bps = alert_threshold_bps;
        agent_config.bump = ctx.bumps.agent_config;

        msg!("Agent configured with {} daily limit", daily_borrow_limit);
        Ok(())
    }

    /// Update existing agent configuration
    pub fn update_agent_config(
        ctx: Context<UpdateAgentConfig>,
        daily_borrow_limit: u64,
        auto_repay_enabled: bool,
        x402_enabled: bool,
        alert_threshold_bps: u16,
    ) -> Result<()> {
        let agent_config = &mut ctx.accounts.agent_config;
        agent_config.daily_borrow_limit = daily_borrow_limit;
        agent_config.auto_repay_enabled = auto_repay_enabled;
        agent_config.x402_enabled = x402_enabled;
        agent_config.alert_threshold_bps = alert_threshold_bps;

        msg!("Agent config updated: {} daily limit", daily_borrow_limit);
        Ok(())
    }

    /// Agent borrow - respects daily limits
    /// Can be called by the agent (position owner) autonomously
    pub fn agent_borrow(ctx: Context<AgentBorrow>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);

        let agent_config = &ctx.accounts.agent_config;
        let now = Clock::get()?.unix_timestamp;

        // Check daily limit
        require!(
            agent_config.can_borrow(amount, now),
            LegasiError::ExceedsLTV // Reuse error for "exceeds limit"
        );

        // Get price and calculate max borrow (same as regular borrow)
        let sol_price = ctx.accounts.sol_price_feed.price_usd_6dec;

        let mut total_collateral_usd: u64 = 0;
        for deposit in &ctx.accounts.position.collaterals {
            if deposit.asset_type == AssetType::SOL || deposit.asset_type == AssetType::CbBTC {
                let value = (deposit.amount as u128)
                    .checked_mul(sol_price as u128)
                    .ok_or(LegasiError::MathOverflow)?
                    .checked_div(LAMPORTS_PER_SOL as u128)
                    .ok_or(LegasiError::MathOverflow)? as u64;
                total_collateral_usd = total_collateral_usd
                    .checked_add(value)
                    .ok_or(LegasiError::MathOverflow)?;
            }
        }

        let mut current_borrow_usd: u64 = 0;
        for borrow in &ctx.accounts.position.borrows {
            let value = borrow
                .amount
                .checked_add(borrow.accrued_interest)
                .ok_or(LegasiError::MathOverflow)?;
            current_borrow_usd = current_borrow_usd
                .checked_add(value)
                .ok_or(LegasiError::MathOverflow)?;
        }

        // Apply reputation bonus to LTV
        let base_ltv = DEFAULT_SOL_MAX_LTV_BPS as u64;
        let reputation_bonus = ctx.accounts.position.reputation.get_ltv_bonus_bps() as u64;
        let effective_ltv = base_ltv.saturating_add(reputation_bonus);

        let max_borrow = total_collateral_usd
            .checked_mul(effective_ltv)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(LegasiError::MathOverflow)?;

        let new_total_borrow = current_borrow_usd
            .checked_add(amount)
            .ok_or(LegasiError::MathOverflow)?;
        require!(new_total_borrow <= max_borrow, LegasiError::ExceedsLTV);

        // Transfer from vault to agent
        let pool_bump = ctx.accounts.lp_pool.bump;
        let borrowable_mint = ctx.accounts.lp_pool.borrowable_mint;
        let seeds: &[&[u8]] = &[b"lp_pool", borrowable_mint.as_ref(), &[pool_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.borrow_vault.to_account_info(),
                    to: ctx.accounts.agent_token_account.to_account_info(),
                    authority: ctx.accounts.lp_pool.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        // Update position
        let position = &mut ctx.accounts.position;
        let asset_type = AssetType::USDC; // Default to USDC for agents

        let mut found = false;
        for borrow in position.borrows.iter_mut() {
            if borrow.asset_type == asset_type {
                borrow.amount = borrow
                    .amount
                    .checked_add(amount)
                    .ok_or(LegasiError::MathOverflow)?;
                found = true;
                break;
            }
        }
        if !found {
            require!(
                position.borrows.len() < 4,
                LegasiError::MaxBorrowTypesReached
            );
            position.borrows.push(BorrowedAmount {
                asset_type,
                amount,
                accrued_interest: 0,
            });
        }
        position.last_update = now;

        // Update agent config daily borrowed
        let agent_config = &mut ctx.accounts.agent_config;
        agent_config.record_borrow(amount, now);

        // Update pool
        let lp_pool = &mut ctx.accounts.lp_pool;
        lp_pool.total_borrowed = lp_pool
            .total_borrowed
            .checked_add(amount)
            .ok_or(LegasiError::MathOverflow)?;

        emit!(AgentBorrowed {
            position: ctx.accounts.position.key(),
            amount,
            daily_remaining: agent_config
                .daily_borrow_limit
                .saturating_sub(agent_config.daily_borrowed),
        });

        msg!("Agent borrowed {} USDC", amount);
        Ok(())
    }

    /// Agent auto-repay - automatically repay debt when USDC is received
    pub fn agent_auto_repay(ctx: Context<AgentAutoRepay>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);
        require!(
            ctx.accounts.agent_config.auto_repay_enabled,
            LegasiError::Unauthorized
        );

        // Transfer from agent to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.agent_token_account.to_account_info(),
                    to: ctx.accounts.borrow_vault.to_account_info(),
                    authority: ctx.accounts.agent.to_account_info(),
                },
            ),
            amount,
        )?;

        // Reduce debt
        let position = &mut ctx.accounts.position;
        let mut remaining = amount;

        for borrow in position.borrows.iter_mut() {
            if remaining == 0 {
                break;
            }

            // First reduce interest
            let interest_payment = std::cmp::min(remaining, borrow.accrued_interest);
            borrow.accrued_interest = borrow.accrued_interest.saturating_sub(interest_payment);
            remaining = remaining.saturating_sub(interest_payment);

            // Then principal
            let principal_payment = std::cmp::min(remaining, borrow.amount);
            borrow.amount = borrow.amount.saturating_sub(principal_payment);
            remaining = remaining.saturating_sub(principal_payment);
        }

        position
            .borrows
            .retain(|b| b.amount > 0 || b.accrued_interest > 0);
        position.last_update = Clock::get()?.unix_timestamp;
        position.reputation.successful_repayments =
            position.reputation.successful_repayments.saturating_add(1);
        position.reputation.total_repaid_usd =
            position.reputation.total_repaid_usd.saturating_add(amount);

        // Update pool
        let lp_pool = &mut ctx.accounts.lp_pool;
        lp_pool.total_borrowed = lp_pool
            .total_borrowed
            .saturating_sub(amount.saturating_sub(remaining));

        msg!(
            "Agent auto-repaid {} USDC",
            amount.saturating_sub(remaining)
        );
        Ok(())
    }

    // ========== x402 PAYMENT FUNCTIONS ==========

    /// Process an x402 payment request
    /// Agent pays for a service, borrowing if needed
    pub fn x402_pay(
        ctx: Context<X402Pay>,
        payment_request: X402PaymentRequest,
        auto_borrow: bool, // Borrow if insufficient balance
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        // Verify request is valid
        require!(payment_request.is_valid(now), LegasiError::InvalidAmount);
        require!(
            ctx.accounts.agent_config.x402_enabled,
            LegasiError::Unauthorized
        );

        let amount = payment_request.amount;

        // Check agent has enough balance
        let agent_balance = ctx.accounts.agent_token_account.amount;

        if agent_balance < amount && auto_borrow {
            // Need to borrow the difference
            let borrow_amount = amount.saturating_sub(agent_balance);

            // Check daily limit
            require!(
                ctx.accounts.agent_config.can_borrow(borrow_amount, now),
                LegasiError::ExceedsLTV
            );

            // Borrow from pool
            let pool_bump = ctx.accounts.lp_pool.bump;
            let borrowable_mint = ctx.accounts.lp_pool.borrowable_mint;
            let seeds: &[&[u8]] = &[b"lp_pool", borrowable_mint.as_ref(), &[pool_bump]];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.borrow_vault.to_account_info(),
                        to: ctx.accounts.agent_token_account.to_account_info(),
                        authority: ctx.accounts.lp_pool.to_account_info(),
                    },
                    &[seeds],
                ),
                borrow_amount,
            )?;

            // Update position debt
            let position = &mut ctx.accounts.position;
            let asset_type = AssetType::USDC;

            let mut found = false;
            for borrow in position.borrows.iter_mut() {
                if borrow.asset_type == asset_type {
                    borrow.amount = borrow
                        .amount
                        .checked_add(borrow_amount)
                        .ok_or(LegasiError::MathOverflow)?;
                    found = true;
                    break;
                }
            }
            if !found {
                position.borrows.push(BorrowedAmount {
                    asset_type,
                    amount: borrow_amount,
                    accrued_interest: 0,
                });
            }

            // Update agent config
            let agent_config = &mut ctx.accounts.agent_config;
            agent_config.record_borrow(borrow_amount, now);

            // Update pool
            let lp_pool = &mut ctx.accounts.lp_pool;
            lp_pool.total_borrowed = lp_pool
                .total_borrowed
                .checked_add(borrow_amount)
                .ok_or(LegasiError::MathOverflow)?;
        }

        // Now pay the recipient
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.agent_token_account.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.agent.to_account_info(),
                },
            ),
            amount,
        )?;

        // Create receipt
        let receipt = &mut ctx.accounts.receipt;
        receipt.payment_id = payment_request.payment_id;
        receipt.payer = ctx.accounts.agent.key();
        receipt.recipient = payment_request.recipient;
        receipt.amount = amount;
        receipt.paid_at = now;
        receipt.tx_signature = [0u8; 64]; // Filled by runtime
        receipt.bump = ctx.bumps.receipt;

        emit!(X402PaymentMade {
            payer: ctx.accounts.agent.key(),
            recipient: payment_request.recipient,
            amount,
            payment_id: payment_request.payment_id,
            borrowed: agent_balance < amount,
        });

        msg!("x402 payment: {} to {}", amount, payment_request.recipient);
        Ok(())
    }
}

#[event]
pub struct X402PaymentMade {
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub payment_id: [u8; 32],
    pub borrowed: bool,
}

#[event]
pub struct AgentBorrowed {
    pub position: Pubkey,
    pub amount: u64,
    pub daily_remaining: u64,
}

/// Off-ramp request status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum OfframpStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

/// Off-ramp request account
#[account]
#[derive(InitSpace)]
pub struct OfframpRequest {
    pub owner: Pubkey,
    pub amount: u64,
    #[max_len(34)]
    pub destination_iban: String,
    #[max_len(100)]
    pub destination_name: String,
    pub status: OfframpStatus,
    pub created_at: i64,
    pub completed_at: i64,
    pub bump: u8,
}

#[event]
pub struct OfframpRequested {
    pub owner: Pubkey,
    pub amount: u64,
    pub destination_iban: String,
    pub asset_type: AssetType,
}

// ========== ACCOUNTS ==========

#[derive(Accounts)]
pub struct InitializeLendingVault<'info> {
    #[account(
        init,
        payer = admin,
        token::mint = mint,
        token::authority = lending_vault,
        seeds = [b"lending_vault", mint.key().as_ref()],
        bump
    )]
    pub lending_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePosition<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    /// CHECK: SOL vault PDA
    #[account(mut, seeds = [b"sol_vault", position.key().as_ref()], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToken<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"collateral", collateral_config.mint.as_ref()], bump = collateral_config.bump)]
    pub collateral_config: Account<'info, Collateral>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"token_vault", collateral_config.mint.as_ref()], bump)]
    pub token_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    /// Protocol state (owned by core program - no seeds validation)
    pub protocol: Account<'info, Protocol>,
    /// Borrowable config (owned by core program - no seeds validation)
    pub borrowable_config: Account<'info, Borrowable>,
    /// Lending vault (owned by this program)
    #[account(
        mut,
        seeds = [b"lending_vault", borrowable_config.mint.as_ref()],
        bump
    )]
    pub borrow_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    /// Price feed (owned by core program - no seeds validation)
    pub sol_price_feed: Account<'info, PriceFeed>,
    /// CHECK: SOL mint
    pub sol_mint: UncheckedAccount<'info>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    /// Borrowable config (owned by core program)
    pub borrowable_config: Account<'info, Borrowable>,
    /// LP vault to transfer repaid tokens to
    #[account(mut)]
    pub repay_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    /// CHECK: SOL vault PDA
    #[account(mut, seeds = [b"sol_vault", position.key().as_ref()], bump)]
    pub sol_vault: UncheckedAccount<'info>,
    /// Price feed (owned by core - no seeds validation)
    pub sol_price_feed: Account<'info, PriceFeed>,
    /// CHECK: SOL mint
    pub sol_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct OfframpViaBridge<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(
        init,
        payer = owner,
        space = 8 + OfframpRequest::INIT_SPACE,
        seeds = [b"offramp", owner.key().as_ref(), &request_id.to_le_bytes()],
        bump
    )]
    pub offramp_request: Account<'info, OfframpRequest>,
    #[account(mut)]
    pub stablecoin_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Accrue interest on a position (permissionless - anyone can crank)
#[derive(Accounts)]
pub struct AccruePositionInterest<'info> {
    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
}

// ========== AGENT ACCOUNTS ==========

#[derive(Accounts)]
pub struct ConfigureAgent<'info> {
    #[account(
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    #[account(
        init,
        payer = owner,
        space = 8 + AgentConfig::INIT_SPACE,
        seeds = [b"agent_config", position.key().as_ref()],
        bump
    )]
    pub agent_config: Account<'info, AgentConfig>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgentConfig<'info> {
    #[account(
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        seeds = [b"agent_config", position.key().as_ref()],
        bump = agent_config.bump
    )]
    pub agent_config: Account<'info, AgentConfig>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct AgentBorrow<'info> {
    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        seeds = [b"agent_config", position.key().as_ref()],
        bump = agent_config.bump,
        constraint = agent_config.position == position.key()
    )]
    pub agent_config: Account<'info, AgentConfig>,
    #[account(
        mut,
        seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,
    #[account(
        mut,
        seeds = [b"lp_vault", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub borrow_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(seeds = [b"price", &[AssetType::SOL as u8]], bump = sol_price_feed.bump)]
    pub sol_price_feed: Account<'info, PriceFeed>,
    /// The agent (position owner) executing the borrow
    #[account(constraint = agent.key() == position.owner)]
    pub agent: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AgentAutoRepay<'info> {
    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        seeds = [b"agent_config", position.key().as_ref()],
        bump = agent_config.bump,
        constraint = agent_config.position == position.key()
    )]
    pub agent_config: Account<'info, AgentConfig>,
    #[account(
        mut,
        seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,
    #[account(
        mut,
        seeds = [b"lp_vault", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub borrow_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    /// The agent executing auto-repay
    #[account(constraint = agent.key() == position.owner)]
    pub agent: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_request: X402PaymentRequest)]
pub struct X402Pay<'info> {
    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Box<Account<'info, Position>>,
    #[account(
        mut,
        seeds = [b"agent_config", position.key().as_ref()],
        bump = agent_config.bump,
        constraint = agent_config.position == position.key()
    )]
    pub agent_config: Box<Account<'info, AgentConfig>>,
    #[account(
        mut,
        seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Box<Account<'info, LpPool>>,
    #[account(
        mut,
        seeds = [b"lp_vault", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub borrow_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = recipient_token_account.owner == payment_request.recipient
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = agent,
        space = 8 + X402Receipt::INIT_SPACE,
        seeds = [b"x402_receipt", payment_request.payment_id.as_ref()],
        bump
    )]
    pub receipt: Box<Account<'info, X402Receipt>>,
    /// The agent making the payment
    #[account(mut, constraint = agent.key() == position.owner)]
    pub agent: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
