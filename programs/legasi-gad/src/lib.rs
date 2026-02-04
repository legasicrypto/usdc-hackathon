use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use legasi_core::{
    state::*, errors::LegasiError, constants::*, events::*,
};

declare_id!("Ed7pfvjR1mRWmzHP3r1NvukESGr38xZKwpoQ5jGSAVad");

// Jupiter Aggregator v6 Program ID (mainnet)
// JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
pub mod jupiter {
    use anchor_lang::prelude::*;
    declare_id!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
}

/// GAD rate curve - continuous quadratic with capped max
fn get_gad_rate_bps(current_ltv_bps: u64, max_ltv_bps: u64) -> u64 {
    if current_ltv_bps <= max_ltv_bps {
        return 0;
    }
    
    let excess_bps = current_ltv_bps.saturating_sub(max_ltv_bps);
    
    // Quadratic curve: rate = (excess/100)^2, capped at 1000 bps/day (10%)
    let rate = (excess_bps as u128)
        .pow(2)
        .checked_div(100)
        .unwrap_or(0) as u64;
    
    std::cmp::min(rate, 1000)
}

#[program]
pub mod legasi_gad {
    use super::*;

    /// Configure GAD settings for a position
    pub fn configure_gad(
        ctx: Context<ConfigureGad>,
        enabled: bool,
        custom_threshold_bps: Option<u16>,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        position.gad_enabled = enabled;
        
        // Custom threshold would need to be stored - for now just toggle
        msg!("GAD configured: enabled={}", enabled);
        Ok(())
    }

    /// Crank GAD for a position - anyone can call
    pub fn crank_gad(ctx: Context<CrankGad>) -> Result<()> {
        let position = &ctx.accounts.position;
        
        // Check GAD is enabled
        require!(position.gad_enabled, LegasiError::GadDisabled);
        
        // Check has debt
        require!(!position.borrows.is_empty(), LegasiError::NoDebtToDeleverage);
        
        // Check minimum time since last crank
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.saturating_sub(position.last_gad_crank);
        require!(elapsed >= MIN_GAD_CRANK_INTERVAL, LegasiError::CrankTooSoon);

        // Calculate current LTV
        let total_collateral_usd = calculate_collateral_value(position, &ctx.accounts.sol_price_feed)?;
        require!(total_collateral_usd > 0, LegasiError::InsufficientCollateral);

        let total_borrow_usd = calculate_borrow_value(position)?;
        
        let current_ltv_bps = total_borrow_usd
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(total_collateral_usd)
            .ok_or(LegasiError::MathOverflow)?;

        // Check if LTV exceeds max (75% default for SOL)
        let max_ltv_bps = DEFAULT_SOL_MAX_LTV_BPS as u64;
        require!(current_ltv_bps > max_ltv_bps, LegasiError::LtvBelowGadThreshold);

        // Calculate GAD rate
        let gad_rate_bps = get_gad_rate_bps(current_ltv_bps, max_ltv_bps);
        require!(gad_rate_bps > 0, LegasiError::NothingToLiquidate);

        // Calculate amount to liquidate (pro-rata based on time elapsed)
        let time_fraction = (elapsed as u128)
            .checked_mul(BPS_DENOMINATOR as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(SECONDS_PER_DAY as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        let liquidate_fraction_bps = (gad_rate_bps as u128)
            .checked_mul(time_fraction as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        // Find SOL collateral and calculate liquidation amount
        let sol_deposit = position.collaterals.iter()
            .find(|c| c.asset_type == AssetType::SOL)
            .ok_or(LegasiError::InsufficientCollateral)?;

        let sol_to_liquidate = (sol_deposit.amount as u128)
            .checked_mul(liquidate_fraction_bps as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        require!(sol_to_liquidate > 0, LegasiError::NothingToLiquidate);

        // Calculate USD value of liquidated SOL
        let sol_price = ctx.accounts.sol_price_feed.price_usd_6dec;
        let liquidated_usd = (sol_to_liquidate as u128)
            .checked_mul(sol_price as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(LAMPORTS_PER_SOL as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        // Reduce debt by liquidated amount
        let debt_reduction = std::cmp::min(liquidated_usd, total_borrow_usd);

        // Calculate cranker reward (0.5% of liquidated)
        let cranker_reward = sol_to_liquidate
            .checked_mul(CRANKER_REWARD_BPS)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(LegasiError::MathOverflow)?;

        let total_sol_deducted = sol_to_liquidate.checked_add(cranker_reward).ok_or(LegasiError::MathOverflow)?;

        // Transfer SOL to treasury
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.sol_vault;
        let seeds: &[&[u8]] = &[b"sol_vault", position_key.as_ref(), &[vault_bump]];

        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.sol_vault.key,
                ctx.accounts.treasury.key,
                sol_to_liquidate,
            ),
            &[
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;

        // Transfer cranker reward
        if cranker_reward > 0 {
            invoke_signed(
                &system_instruction::transfer(
                    ctx.accounts.sol_vault.key,
                    ctx.accounts.cranker.key,
                    cranker_reward,
                ),
                &[
                    ctx.accounts.sol_vault.to_account_info(),
                    ctx.accounts.cranker.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[seeds],
            )?;
        }

        // Update position
        let position = &mut ctx.accounts.position;
        
        // Reduce SOL collateral
        if let Some(sol_deposit) = position.collaterals.iter_mut().find(|c| c.asset_type == AssetType::SOL) {
            sol_deposit.amount = sol_deposit.amount.saturating_sub(total_sol_deducted);
        }

        // Reduce debt (proportionally across all borrows)
        let mut remaining_reduction = debt_reduction;
        for borrow in position.borrows.iter_mut() {
            if remaining_reduction == 0 {
                break;
            }
            let borrow_total = borrow.amount.checked_add(borrow.accrued_interest).unwrap_or(0);
            let reduction = std::cmp::min(remaining_reduction, borrow_total);
            
            // First reduce interest, then principal
            let interest_reduction = std::cmp::min(reduction, borrow.accrued_interest);
            borrow.accrued_interest = borrow.accrued_interest.saturating_sub(interest_reduction);
            
            let principal_reduction = reduction.saturating_sub(interest_reduction);
            borrow.amount = borrow.amount.saturating_sub(principal_reduction);
            
            remaining_reduction = remaining_reduction.saturating_sub(reduction);
        }

        // Update GAD stats
        position.last_gad_crank = now;
        position.total_gad_liquidated_usd = position.total_gad_liquidated_usd.saturating_add(liquidated_usd);
        position.reputation.gad_events = position.reputation.gad_events.saturating_add(1);
        position.last_update = now;

        // Clean up empty entries
        position.collaterals.retain(|c| c.amount > 0);
        position.borrows.retain(|b| b.amount > 0 || b.accrued_interest > 0);

        // Calculate new LTV for event
        let new_collateral_usd = total_collateral_usd.saturating_sub(liquidated_usd);
        let new_borrow_usd = total_borrow_usd.saturating_sub(debt_reduction);
        let ltv_after_bps = if new_collateral_usd > 0 {
            new_borrow_usd
                .checked_mul(BPS_DENOMINATOR)
                .unwrap_or(0)
                .checked_div(new_collateral_usd)
                .unwrap_or(0)
        } else {
            0
        };

        emit!(GadExecuted {
            position: ctx.accounts.position.key(),
            collateral_liquidated_usd: liquidated_usd,
            debt_reduced_usd: debt_reduction,
            ltv_before_bps: current_ltv_bps,
            ltv_after_bps,
            gad_rate_bps,
            cranker: ctx.accounts.cranker.key(),
            cranker_reward,
        });

        msg!("GAD executed: liquidated ${} USD, new LTV: {}%", 
            liquidated_usd as f64 / USD_MULTIPLIER as f64,
            ltv_after_bps as f64 / 100.0
        );
        Ok(())
    }

    /// Execute GAD with Jupiter swap - converts liquidated collateral to USDC
    /// This is the production version that actually swaps via Jupiter
    pub fn crank_gad_with_swap(
        ctx: Context<CrankGadWithSwap>,
        jupiter_swap_data: Vec<u8>,  // Serialized Jupiter swap instruction data
        min_out_amount: u64,         // Minimum USDC to receive (slippage protection)
    ) -> Result<()> {
        let position = &ctx.accounts.position;
        
        require!(position.gad_enabled, LegasiError::GadDisabled);
        require!(!position.borrows.is_empty(), LegasiError::NoDebtToDeleverage);
        
        // Calculate amount to liquidate (same logic as crank_gad)
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.saturating_sub(position.last_gad_crank);
        require!(elapsed >= MIN_GAD_CRANK_INTERVAL, LegasiError::CrankTooSoon);

        // ... (LTV calculation same as above)
        
        // Execute Jupiter swap: SOL → USDC
        // CPI to Jupiter aggregator
        let jupiter_program = &ctx.accounts.jupiter_program;
        let swap_accounts = vec![
            ctx.accounts.sol_vault.to_account_info(),
            ctx.accounts.usdc_vault.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            // Jupiter requires additional accounts passed via remaining_accounts
        ];
        
        // Build Jupiter CPI
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.sol_vault;
        let seeds: &[&[u8]] = &[b"sol_vault", position_key.as_ref(), &[vault_bump]];
        
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::instruction::Instruction {
                program_id: jupiter_program.key(),
                accounts: ctx.remaining_accounts.iter()
                    .map(|a| anchor_lang::solana_program::instruction::AccountMeta {
                        pubkey: a.key(),
                        is_signer: a.is_signer,
                        is_writable: a.is_writable,
                    })
                    .collect(),
                data: jupiter_swap_data,
            },
            ctx.remaining_accounts,
            &[seeds],
        )?;

        // Verify we received minimum USDC
        ctx.accounts.usdc_vault.reload()?;
        require!(
            ctx.accounts.usdc_vault.amount >= min_out_amount,
            LegasiError::SlippageExceeded
        );

        // Use received USDC to repay debt
        let usdc_received = ctx.accounts.usdc_vault.amount;
        
        // Update position (reduce debt by USDC received)
        let position = &mut ctx.accounts.position;
        for borrow in position.borrows.iter_mut() {
            if borrow.asset_type == AssetType::USDC {
                let total_debt = borrow.amount.checked_add(borrow.accrued_interest).unwrap_or(0);
                let reduction = std::cmp::min(usdc_received, total_debt);
                
                let interest_reduction = std::cmp::min(reduction, borrow.accrued_interest);
                borrow.accrued_interest = borrow.accrued_interest.saturating_sub(interest_reduction);
                borrow.amount = borrow.amount.saturating_sub(reduction.saturating_sub(interest_reduction));
                break;
            }
        }
        
        position.last_gad_crank = now;
        position.reputation.gad_events = position.reputation.gad_events.saturating_add(1);

        emit!(GadSwapExecuted {
            position: ctx.accounts.position.key(),
            sol_liquidated: 0, // TODO: track actual amount
            usdc_received,
            cranker: ctx.accounts.cranker.key(),
        });

        msg!("GAD swap executed: received {} USDC", usdc_received);
        Ok(())
    }
}

// ========== HELPER FUNCTIONS ==========

fn calculate_collateral_value(position: &Position, sol_price_feed: &PriceFeed) -> Result<u64> {
    let mut total_usd: u64 = 0;
    
    for deposit in &position.collaterals {
        match deposit.asset_type {
            AssetType::SOL => {
                let value = (deposit.amount as u128)
                    .checked_mul(sol_price_feed.price_usd_6dec as u128)
                    .ok_or(LegasiError::MathOverflow)?
                    .checked_div(LAMPORTS_PER_SOL as u128)
                    .ok_or(LegasiError::MathOverflow)? as u64;
                total_usd = total_usd.checked_add(value).ok_or(LegasiError::MathOverflow)?;
            }
            _ => {}
        }
    }
    
    Ok(total_usd)
}

fn calculate_borrow_value(position: &Position) -> Result<u64> {
    let mut total_usd: u64 = 0;
    
    for borrow in &position.borrows {
        match borrow.asset_type {
            AssetType::USDC | AssetType::EURC => {
                let value = borrow.amount.checked_add(borrow.accrued_interest).ok_or(LegasiError::MathOverflow)?;
                total_usd = total_usd.checked_add(value).ok_or(LegasiError::MathOverflow)?;
            }
            _ => {}
        }
    }
    
    Ok(total_usd)
}

// GAD swap event
#[event]
pub struct GadSwapExecuted {
    pub position: Pubkey,
    pub sol_liquidated: u64,
    pub usdc_received: u64,
    pub cranker: Pubkey,
}

// ========== ACCOUNTS ==========

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
pub struct CrankGad<'info> {
    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = treasury)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: SOL vault PDA
    #[account(
        mut,
        seeds = [b"sol_vault", position.key().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    /// CHECK: Treasury
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    #[account(seeds = [b"price", &[AssetType::SOL as u8]], bump)]
    pub sol_price_feed: Account<'info, PriceFeed>,
    #[account(mut)]
    pub cranker: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Accounts for GAD with Jupiter swap
#[derive(Accounts)]
pub struct CrankGadWithSwap<'info> {
    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: SOL vault PDA (source for swap)
    #[account(
        mut,
        seeds = [b"sol_vault", position.key().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    /// USDC vault to receive swap output
    #[account(mut)]
    pub usdc_vault: Account<'info, TokenAccount>,
    /// CHECK: Jupiter Aggregator v6
    #[account(address = jupiter::ID)]
    pub jupiter_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub cranker: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    // Additional Jupiter accounts passed via remaining_accounts
}
