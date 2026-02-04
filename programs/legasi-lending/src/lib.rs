use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

use legasi_core::{state::*, errors::LegasiError, constants::*};

declare_id!("DGRYqD9Hg9v27Fa9kLUUf3KY9hoprjBQp7y88qG9q88u");

#[program]
pub mod legasi_lending {
    use super::*;

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
                deposit.amount = deposit.amount.checked_add(amount).ok_or(LegasiError::MathOverflow)?;
                found = true;
                break;
            }
        }
        
        if !found {
            require!(position.collaterals.len() < MAX_COLLATERAL_TYPES, LegasiError::MaxCollateralTypesReached);
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
        require!(ctx.accounts.collateral_config.is_active, LegasiError::AssetNotActive);

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
                deposit.amount = deposit.amount.checked_add(amount).ok_or(LegasiError::MathOverflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(position.collaterals.len() < MAX_COLLATERAL_TYPES, LegasiError::MaxCollateralTypesReached);
            position.collaterals.push(CollateralDeposit {
                asset_type,
                amount,
            });
        }

        position.last_update = Clock::get()?.unix_timestamp;

        let collateral_config = &mut ctx.accounts.collateral_config;
        collateral_config.total_deposited = collateral_config.total_deposited
            .checked_add(amount)
            .ok_or(LegasiError::MathOverflow)?;

        msg!("Deposited {} {:?}", amount, asset_type);
        Ok(())
    }

    /// Borrow stablecoins (USDC, EURC)
    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);
        require!(ctx.accounts.borrowable_config.is_active, LegasiError::AssetNotActive);
        require!(ctx.accounts.borrow_vault.amount >= amount, LegasiError::InsufficientLiquidity);

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
                total_collateral_usd = total_collateral_usd.checked_add(value).ok_or(LegasiError::MathOverflow)?;
            }
        }

        // Calculate borrow value  
        let mut current_borrow_usd: u64 = 0;
        for borrow in &ctx.accounts.position.borrows {
            let value = borrow.amount.checked_add(borrow.accrued_interest).ok_or(LegasiError::MathOverflow)?;
            current_borrow_usd = current_borrow_usd.checked_add(value).ok_or(LegasiError::MathOverflow)?;
        }
        let new_borrow_usd = current_borrow_usd.checked_add(amount).ok_or(LegasiError::MathOverflow)?;

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

        // Transfer tokens
        let bump = ctx.accounts.protocol.bump;
        let seeds: &[&[u8]] = &[b"protocol", &[bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.borrow_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
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
                borrow.amount = borrow.amount.checked_add(amount).ok_or(LegasiError::MathOverflow)?;
                found = true;
                break;
            }
        }

        if !found {
            require!(position.borrows.len() < MAX_BORROW_TYPES, LegasiError::MaxBorrowTypesReached);
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
                total_owed = borrow.amount.checked_add(borrow.accrued_interest).ok_or(LegasiError::MathOverflow)?;
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
                    to: ctx.accounts.borrow_vault.to_account_info(),
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
        position.borrows.retain(|b| b.amount > 0 || b.accrued_interest > 0);

        position.reputation.successful_repayments = position.reputation.successful_repayments.saturating_add(1);
        position.reputation.total_repaid_usd = position.reputation.total_repaid_usd.saturating_add(repay_amount);
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
            let remaining = sol_amount.checked_sub(amount).ok_or(LegasiError::MathOverflow)?;
            let remaining_value = (remaining as u128)
                .checked_mul(sol_price as u128)
                .ok_or(LegasiError::MathOverflow)?
                .checked_div(LAMPORTS_PER_SOL as u128)
                .ok_or(LegasiError::MathOverflow)? as u64;

            let mut total_borrow: u64 = 0;
            for borrow in &ctx.accounts.position.borrows {
                total_borrow = total_borrow.checked_add(borrow.amount).ok_or(LegasiError::MathOverflow)?;
                total_borrow = total_borrow.checked_add(borrow.accrued_interest).ok_or(LegasiError::MathOverflow)?;
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
                AssetType::USDC => 800,  // 8% APR
                AssetType::EURC => 700,  // 7% APR
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
        amount: u64,
        destination_iban: String,     // Bank account IBAN
        destination_name: String,      // Recipient name
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
        require!(borrowed_amount >= amount, LegasiError::InsufficientLiquidity);
        
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
        
        msg!("Off-ramp requested: {} USDC to {}", amount, destination_name);
        Ok(())
    }
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
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(seeds = [b"borrowable", borrowable_config.mint.as_ref()], bump = borrowable_config.bump)]
    pub borrowable_config: Account<'info, Borrowable>,
    #[account(mut, seeds = [b"borrow_vault", borrowable_config.mint.as_ref()], bump)]
    pub borrow_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(seeds = [b"price", sol_mint.key().as_ref()], bump = sol_price_feed.bump)]
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
    #[account(seeds = [b"borrowable", borrowable_config.mint.as_ref()], bump = borrowable_config.bump)]
    pub borrowable_config: Account<'info, Borrowable>,
    #[account(mut, seeds = [b"borrow_vault", borrowable_config.mint.as_ref()], bump)]
    pub borrow_vault: Account<'info, TokenAccount>,
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
    #[account(seeds = [b"price", sol_mint.key().as_ref()], bump = sol_price_feed.bump)]
    pub sol_price_feed: Account<'info, PriceFeed>,
    /// CHECK: SOL mint
    pub sol_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OfframpViaBridge<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(
        init,
        payer = owner,
        space = 8 + OfframpRequest::INIT_SPACE,
        seeds = [b"offramp", owner.key().as_ref(), &Clock::get().unwrap().unix_timestamp.to_le_bytes()],
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
