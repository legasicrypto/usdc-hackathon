use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;

declare_id!("7bv6nbBwrPUEHnusd4zsHMdRy3btP8sEKW7sq7Hxode5");

// Constants
const MAX_LTV_BPS: u64 = 5000; // 50% max LTV
const GAD_START_LTV_BPS: u64 = 5000; // GAD starts at 50%
const SECONDS_PER_DAY: i64 = 86400;

/// GAD Rate tiers (basis points per day)
/// 50-55% LTV: 10 bps/day (0.1%)
/// 55-65% LTV: 100 bps/day (1%)
/// 65-75% LTV: 500 bps/day (5%)
/// 75%+ LTV: 1000 bps/day (10%)
fn get_gad_rate_bps(ltv_bps: u64) -> u64 {
    if ltv_bps <= 5000 {
        0
    } else if ltv_bps <= 5500 {
        10
    } else if ltv_bps <= 6500 {
        100
    } else if ltv_bps <= 7500 {
        500
    } else {
        1000
    }
}

#[program]
pub mod legasi_credit {
    use super::*;

    /// Initialize the protocol (admin only, once)
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, sol_price_usd: u64) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.admin = ctx.accounts.admin.key();
        protocol.sol_price_usd_6dec = sol_price_usd; // Price with 6 decimals (e.g., 100_000_000 = $100)
        protocol.last_price_update = Clock::get()?.unix_timestamp;
        protocol.total_collateral = 0;
        protocol.total_borrowed = 0;
        protocol.treasury = ctx.accounts.treasury.key();
        protocol.bump = ctx.bumps.protocol;
        
        msg!("Protocol initialized with SOL price ${}", sol_price_usd / 1_000_000);
        Ok(())
    }

    /// Update SOL price (admin/oracle only)
    pub fn update_price(ctx: Context<UpdatePrice>, new_price_usd: u64) -> Result<()> {
        require!(new_price_usd > 0, ErrorCode::InvalidAmount);
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.sol_price_usd_6dec = new_price_usd;
        protocol.last_price_update = Clock::get()?.unix_timestamp;
        
        msg!("Price updated to ${}.{:06}", new_price_usd / 1_000_000, new_price_usd % 1_000_000);
        Ok(())
    }

    /// Initialize a new credit position for a user
    pub fn initialize_position(ctx: Context<InitializePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.collateral_amount = 0;
        position.borrowed_amount = 0;
        position.last_update = Clock::get()?.unix_timestamp;
        position.last_gad_crank = Clock::get()?.unix_timestamp;
        position.gad_config = GadConfig::default();
        position.total_gad_liquidated = 0;
        position.bump = ctx.bumps.position;
        
        msg!("Position initialized for {}", position.owner);
        Ok(())
    }

    /// Configure GAD settings for a position
    pub fn configure_gad(
        ctx: Context<ConfigureGad>,
        enabled: bool,
        custom_start_ltv_bps: Option<u64>,
        min_collateral_floor: Option<u64>,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        
        position.gad_config.enabled = enabled;
        
        if let Some(start_ltv) = custom_start_ltv_bps {
            require!(start_ltv >= 4000 && start_ltv <= 7000, ErrorCode::InvalidGadConfig);
            position.gad_config.custom_start_ltv_bps = start_ltv;
        }
        
        if let Some(floor) = min_collateral_floor {
            position.gad_config.min_collateral_floor = floor;
        }
        
        msg!("GAD configured: enabled={}, start_ltv={}bps, floor={}", 
            enabled, 
            position.gad_config.custom_start_ltv_bps,
            position.gad_config.min_collateral_floor
        );
        Ok(())
    }

    /// Deposit SOL as collateral
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        invoke(
            &system_instruction::transfer(
                ctx.accounts.owner.key,
                ctx.accounts.collateral_vault.key,
                amount,
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        let position = &mut ctx.accounts.position;
        position.collateral_amount = position.collateral_amount.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        position.last_update = Clock::get()?.unix_timestamp;
        
        // Update protocol stats
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        msg!("Deposited {} lamports as collateral", amount);
        Ok(())
    }

    /// Borrow against collateral (accounting only - USDC transfer handled separately)
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let position = &mut ctx.accounts.position;
        let protocol = &ctx.accounts.protocol;
        
        let sol_price_usd = protocol.sol_price_usd_6dec;
        
        // Calculate max borrowable (50% LTV)
        // collateral in lamports, price in 6 decimals
        let collateral_value_usd = (position.collateral_amount as u128)
            .checked_mul(sol_price_usd as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000) // Convert lamports to SOL
            .ok_or(ErrorCode::MathOverflow)?;
        
        let max_borrow = collateral_value_usd
            .checked_mul(MAX_LTV_BPS as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let new_borrowed = position.borrowed_amount.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        require!(new_borrowed <= max_borrow, ErrorCode::ExceedsLTV);
        
        position.borrowed_amount = new_borrowed;
        position.last_update = Clock::get()?.unix_timestamp;
        
        // Update protocol stats
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_borrowed = protocol.total_borrowed.checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        msg!("Borrowed {} USDC (max: {}, LTV: {}%)", amount, max_borrow, new_borrowed * 100 / max_borrow);
        Ok(())
    }

    /// Repay borrowed USDC
    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let position = &mut ctx.accounts.position;
        let repay_amount = std::cmp::min(amount, position.borrowed_amount);
        
        position.borrowed_amount = position.borrowed_amount.checked_sub(repay_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        position.last_update = Clock::get()?.unix_timestamp;
        
        // Update protocol stats
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_borrowed = protocol.total_borrowed.saturating_sub(repay_amount);
        
        msg!("Repaid {} USDC", repay_amount);
        Ok(())
    }

    /// Withdraw collateral (if LTV allows)
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let position = &ctx.accounts.position;
        let protocol = &ctx.accounts.protocol;
        require!(amount <= position.collateral_amount, ErrorCode::InsufficientCollateral);
        
        let remaining_collateral = position.collateral_amount.checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Check LTV after withdrawal
        if position.borrowed_amount > 0 {
            let sol_price_usd = protocol.sol_price_usd_6dec;
            let remaining_value = (remaining_collateral as u128)
                .checked_mul(sol_price_usd as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(1_000_000_000)
                .ok_or(ErrorCode::MathOverflow)?;
            
            let max_borrow = remaining_value
                .checked_mul(MAX_LTV_BPS as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(10000)
                .ok_or(ErrorCode::MathOverflow)? as u64;
            
            require!(position.borrowed_amount <= max_borrow, ErrorCode::ExceedsLTV);
        }
        
        // Check collateral floor
        require!(
            remaining_collateral >= position.gad_config.min_collateral_floor,
            ErrorCode::BelowCollateralFloor
        );
        
        // Transfer from vault
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let seeds: &[&[u8]] = &[b"vault", position_key.as_ref(), &[vault_bump]];
        
        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.collateral_vault.key,
                ctx.accounts.owner.key,
                amount,
            ),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;
        
        let position = &mut ctx.accounts.position;
        position.collateral_amount = remaining_collateral;
        position.last_update = Clock::get()?.unix_timestamp;
        
        // Update protocol stats
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.saturating_sub(amount);
        
        msg!("Withdrew {} lamports", amount);
        Ok(())
    }

    /// GAD Crank - Anyone can call this to process gradual auto-deleveraging
    /// Caller receives a small reward for keeping the system healthy
    pub fn crank_gad(ctx: Context<CrankGad>) -> Result<()> {
        // Get immutable values first (before any mutable borrows)
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let cranker_key = ctx.accounts.cranker.key();
        
        let position = &ctx.accounts.position;
        let protocol = &ctx.accounts.protocol;
        
        // Check if GAD is enabled
        require!(position.gad_config.enabled, ErrorCode::GadDisabled);
        
        // Check if there's debt to deleverage
        require!(position.borrowed_amount > 0, ErrorCode::NoDebtToDeleverage);
        
        let sol_price_usd = protocol.sol_price_usd_6dec;
        
        // Calculate current LTV
        let collateral_value_usd = (position.collateral_amount as u128)
            .checked_mul(sol_price_usd as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000)
            .ok_or(ErrorCode::MathOverflow)?;
        
        if collateral_value_usd == 0 {
            return err!(ErrorCode::NoCollateral);
        }
        
        let current_ltv_bps = (position.borrowed_amount as u128)
            .checked_mul(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(collateral_value_usd)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        // Check if LTV is above GAD start threshold
        let start_ltv = position.gad_config.custom_start_ltv_bps;
        require!(current_ltv_bps > start_ltv, ErrorCode::LtvBelowGadThreshold);
        
        // Calculate time since last crank
        let now = Clock::get()?.unix_timestamp;
        let time_elapsed = now.checked_sub(position.last_gad_crank)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Minimum 1 hour between cranks to prevent spam
        require!(time_elapsed >= 3600, ErrorCode::CrankTooSoon);
        
        // Get GAD rate based on current LTV
        let gad_rate_bps = get_gad_rate_bps(current_ltv_bps);
        
        // Calculate amount to liquidate (proportional to time elapsed)
        let liquidate_amount = (position.collateral_amount as u128)
            .checked_mul(gad_rate_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(time_elapsed as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(SECONDS_PER_DAY as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        // Calculate max liquidatable and actual amount
        let max_liquidatable = position.collateral_amount
            .saturating_sub(position.gad_config.min_collateral_floor);
        let actual_liquidate = std::cmp::min(liquidate_amount, max_liquidatable);
        
        require!(actual_liquidate > 0, ErrorCode::NothingToLiquidate);
        
        // Calculate USDC value of liquidated collateral
        let usdc_value = (actual_liquidate as u128)
            .checked_mul(sol_price_usd as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        // Reduce debt by the USDC value
        let debt_reduction = std::cmp::min(usdc_value, position.borrowed_amount);
        
        // Calculate crank reward (0.5% of liquidated amount)
        let crank_reward = actual_liquidate / 200;
        let total_deduct = actual_liquidate.checked_add(crank_reward).ok_or(ErrorCode::MathOverflow)?;
        
        // Build seeds for PDA signing
        let seeds: &[&[u8]] = &[b"vault", position_key.as_ref(), &[vault_bump]];
        
        // Transfer liquidated SOL to protocol treasury
        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.collateral_vault.key,
                ctx.accounts.treasury.key,
                actual_liquidate,
            ),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;
        
        // Reward the cranker
        if crank_reward > 0 {
            invoke_signed(
                &system_instruction::transfer(
                    ctx.accounts.collateral_vault.key,
                    ctx.accounts.cranker.key,
                    crank_reward,
                ),
                &[
                    ctx.accounts.collateral_vault.to_account_info(),
                    ctx.accounts.cranker.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[seeds],
            )?;
        }
        
        // Now get mutable references and update state
        let position_mut = &mut ctx.accounts.position;
        position_mut.collateral_amount = position_mut.collateral_amount
            .checked_sub(total_deduct)
            .ok_or(ErrorCode::MathOverflow)?;
        position_mut.borrowed_amount = position_mut.borrowed_amount
            .checked_sub(debt_reduction)
            .ok_or(ErrorCode::MathOverflow)?;
        position_mut.last_gad_crank = now;
        position_mut.total_gad_liquidated = position_mut.total_gad_liquidated
            .checked_add(actual_liquidate)
            .ok_or(ErrorCode::MathOverflow)?;
        position_mut.last_update = now;
        
        // Update protocol stats
        let protocol_mut = &mut ctx.accounts.protocol;
        protocol_mut.total_collateral = protocol_mut.total_collateral.saturating_sub(total_deduct);
        protocol_mut.total_borrowed = protocol_mut.total_borrowed.saturating_sub(debt_reduction);
        
        msg!(
            "GAD executed: liquidated {} lamports, reduced debt by {} USDC, LTV: {}bps, cranker reward: {}",
            actual_liquidate,
            debt_reduction,
            current_ltv_bps,
            crank_reward
        );
        
        // Emit event for frontend
        emit!(GadExecuted {
            position: position_key,
            collateral_liquidated: actual_liquidate,
            debt_reduced: debt_reduction,
            ltv_before_bps: current_ltv_bps,
            cranker: cranker_key,
            crank_reward,
        });
        
        Ok(())
    }

    /// Get position health and GAD status
    pub fn get_position_health(ctx: Context<GetPositionHealth>) -> Result<()> {
        let position = &ctx.accounts.position;
        let protocol = &ctx.accounts.protocol;
        
        let sol_price_usd = protocol.sol_price_usd_6dec;
        
        let collateral_value_usd = (position.collateral_amount as u128)
            .checked_mul(sol_price_usd as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let current_ltv_bps = if collateral_value_usd > 0 {
            (position.borrowed_amount as u128)
                .checked_mul(10000)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(collateral_value_usd as u128)
                .ok_or(ErrorCode::MathOverflow)? as u64
        } else {
            0
        };
        
        let gad_rate_bps = get_gad_rate_bps(current_ltv_bps);
        let is_gad_active = position.gad_config.enabled && current_ltv_bps > position.gad_config.custom_start_ltv_bps;
        
        // Calculate time to full liquidation at current rate
        let seconds_to_full_liquidation = if gad_rate_bps > 0 && position.collateral_amount > 0 {
            let liquidatable = position.collateral_amount.saturating_sub(position.gad_config.min_collateral_floor);
            (liquidatable as u128)
                .checked_mul(10000)
                .and_then(|v| v.checked_mul(SECONDS_PER_DAY as u128))
                .and_then(|v| v.checked_div(position.collateral_amount as u128))
                .and_then(|v| v.checked_div(gad_rate_bps as u128))
                .unwrap_or(0) as i64
        } else {
            -1 // Infinite (no liquidation happening)
        };
        
        emit!(PositionHealth {
            position: ctx.accounts.position.key(),
            collateral_amount: position.collateral_amount,
            borrowed_amount: position.borrowed_amount,
            collateral_value_usd,
            current_ltv_bps,
            gad_rate_bps_per_day: gad_rate_bps,
            is_gad_active,
            seconds_to_full_liquidation,
            sol_price_usd,
            total_gad_liquidated: position.total_gad_liquidated,
        });
        
        Ok(())
    }
}

// Account structs
#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    /// CHECK: Treasury account to receive liquidated collateral
    pub treasury: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = admin
    )]
    pub protocol: Account<'info, Protocol>,
    
    pub admin: Signer<'info>,
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
pub struct ConfigureGad<'info> {
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    /// CHECK: PDA vault for collateral
    #[account(
        mut,
        seeds = [b"vault", position.key().as_ref()],
        bump
    )]
    pub collateral_vault: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
    
    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"vault", position.key().as_ref()],
        bump
    )]
    pub collateral_vault: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CrankGad<'info> {
    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
    
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = treasury
    )]
    pub protocol: Account<'info, Protocol>,
    
    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"vault", position.key().as_ref()],
        bump
    )]
    pub collateral_vault: UncheckedAccount<'info>,
    
    /// CHECK: Protocol treasury
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    
    /// Cranker receives reward
    #[account(mut)]
    pub cranker: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetPositionHealth<'info> {
    pub position: Account<'info, Position>,
    
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump
    )]
    pub protocol: Account<'info, Protocol>,
}

// Data structs
#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub admin: Pubkey,
    pub sol_price_usd_6dec: u64, // SOL price in USD with 6 decimals
    pub last_price_update: i64,
    pub total_collateral: u64,
    pub total_borrowed: u64,
    pub treasury: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
    pub last_update: i64,
    pub last_gad_crank: i64,
    pub gad_config: GadConfig,
    pub total_gad_liquidated: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct GadConfig {
    pub enabled: bool,
    pub custom_start_ltv_bps: u64, // Default 5000 (50%)
    pub min_collateral_floor: u64, // User-defined minimum collateral
}

impl Default for GadConfig {
    fn default() -> Self {
        Self {
            enabled: true, // GAD enabled by default for safety
            custom_start_ltv_bps: GAD_START_LTV_BPS,
            min_collateral_floor: 0,
        }
    }
}

// Events
#[event]
pub struct GadExecuted {
    pub position: Pubkey,
    pub collateral_liquidated: u64,
    pub debt_reduced: u64,
    pub ltv_before_bps: u64,
    pub cranker: Pubkey,
    pub crank_reward: u64,
}

#[event]
pub struct PositionHealth {
    pub position: Pubkey,
    pub collateral_amount: u64,
    pub borrowed_amount: u64,
    pub collateral_value_usd: u64,
    pub current_ltv_bps: u64,
    pub gad_rate_bps_per_day: u64,
    pub is_gad_active: bool,
    pub seconds_to_full_liquidation: i64,
    pub sol_price_usd: u64,
    pub total_gad_liquidated: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Exceeds maximum LTV (50%)")]
    ExceedsLTV,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("GAD is disabled for this position")]
    GadDisabled,
    #[msg("No debt to deleverage")]
    NoDebtToDeleverage,
    #[msg("No collateral in position")]
    NoCollateral,
    #[msg("LTV is below GAD threshold")]
    LtvBelowGadThreshold,
    #[msg("Crank called too soon (min 1 hour)")]
    CrankTooSoon,
    #[msg("Nothing to liquidate")]
    NothingToLiquidate,
    #[msg("Withdrawal would go below collateral floor")]
    BelowCollateralFloor,
    #[msg("Invalid GAD configuration")]
    InvalidGadConfig,
}
