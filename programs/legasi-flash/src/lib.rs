use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use legasi_core::{constants::*, errors::LegasiError, events::*, state::AssetType};

declare_id!("Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m");

// ========== LOCAL STRUCTS (for cross-program account validation) ==========

/// LP Pool (owned by LP program)
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

/// Borrowable config (owned by core program)
#[account]
#[derive(InitSpace)]
pub struct Borrowable {
    pub mint: Pubkey,
    pub oracle: Pubkey,
    pub interest_rate_bps: u16,
    pub decimals: u8,
    pub is_active: bool,
    pub asset_type: AssetType,
    pub bump: u8,
}

/// Protocol state (owned by core program)
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

/// Flash loan state (tracks outstanding loans in a transaction)
#[account]
#[derive(InitSpace)]
pub struct FlashLoanState {
    pub borrower: Pubkey,
    pub asset_type: AssetType,
    pub amount: u64,
    pub fee: u64,
    pub initiated_slot: u64,
    pub repaid: bool,
    pub bump: u8,
}

#[program]
pub mod legasi_flash {
    use super::*;

    /// Initiate a flash loan - must be repaid in same transaction
    pub fn flash_borrow(ctx: Context<FlashBorrow>, amount: u64, slot: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);

        // Verify slot matches current slot (prevents replay)
        let current_slot = Clock::get()?.slot;
        require!(slot == current_slot, LegasiError::InvalidSlot);
        require!(
            ctx.accounts.vault.amount >= amount,
            LegasiError::InsufficientLiquidity
        );

        // Calculate fee (0.05%, minimum 1 token)
        let fee = std::cmp::max(
            amount
                .checked_mul(FLASH_LOAN_FEE_BPS)
                .ok_or(LegasiError::MathOverflow)?
                .checked_div(BPS_DENOMINATOR)
                .ok_or(LegasiError::MathOverflow)?,
            MIN_FLASH_LOAN_FEE,
        );

        // Initialize flash loan state
        let flash_state = &mut ctx.accounts.flash_state;
        flash_state.borrower = ctx.accounts.borrower.key();
        flash_state.asset_type = ctx.accounts.borrowable.asset_type;
        flash_state.amount = amount;
        flash_state.fee = fee;
        flash_state.initiated_slot = Clock::get()?.slot;
        flash_state.repaid = false;
        flash_state.bump = ctx.bumps.flash_state;

        // Transfer tokens to borrower
        let pool_bump = ctx.accounts.lp_pool.bump;
        let borrowable_mint = ctx.accounts.lp_pool.borrowable_mint;
        let seeds: &[&[u8]] = &[b"lp_pool", borrowable_mint.as_ref(), &[pool_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.lp_pool.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(FlashLoanInitiated {
            borrower: ctx.accounts.borrower.key(),
            asset_type: flash_state.asset_type,
            amount,
            fee,
        });

        msg!("Flash loan initiated: {} tokens, fee: {}", amount, fee);
        Ok(())
    }

    /// Repay flash loan + fee - must be in same transaction as borrow
    pub fn flash_repay(ctx: Context<FlashRepay>) -> Result<()> {
        let flash_state = &ctx.accounts.flash_state;

        // Verify same slot (same transaction)
        let current_slot = Clock::get()?.slot;
        require!(
            flash_state.initiated_slot == current_slot,
            LegasiError::FlashLoanNotRepaid
        );
        require!(!flash_state.repaid, LegasiError::FlashLoanNotRepaid);

        let total_repayment = flash_state
            .amount
            .checked_add(flash_state.fee)
            .ok_or(LegasiError::MathOverflow)?;

        // Transfer repayment from borrower to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            total_repayment,
        )?;

        // Mark as repaid
        let flash_state = &mut ctx.accounts.flash_state;
        flash_state.repaid = true;

        // Fee goes to LP pool (increases LP token value)
        let lp_pool = &mut ctx.accounts.lp_pool;
        let insurance_fee = flash_state
            .fee
            .checked_mul(INSURANCE_FEE_BPS)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(LegasiError::MathOverflow)?;

        let lp_fee = flash_state.fee.saturating_sub(insurance_fee);
        lp_pool.total_deposits = lp_pool
            .total_deposits
            .checked_add(lp_fee)
            .ok_or(LegasiError::MathOverflow)?;
        lp_pool.interest_earned = lp_pool
            .interest_earned
            .checked_add(lp_fee)
            .ok_or(LegasiError::MathOverflow)?;

        // Update protocol insurance
        let protocol = &mut ctx.accounts.protocol;
        protocol.insurance_fund = protocol
            .insurance_fund
            .checked_add(insurance_fee)
            .ok_or(LegasiError::MathOverflow)?;

        emit!(FlashLoanRepaid {
            borrower: ctx.accounts.borrower.key(),
            asset_type: flash_state.asset_type,
            amount: flash_state.amount,
            fee: flash_state.fee,
        });

        msg!(
            "Flash loan repaid: {} + {} fee",
            flash_state.amount,
            flash_state.fee
        );
        Ok(())
    }

    /// Close flash loan state account (cleanup after repayment)
    pub fn close_flash_state(ctx: Context<CloseFlashState>) -> Result<()> {
        let flash_state = &ctx.accounts.flash_state;
        require!(flash_state.repaid, LegasiError::FlashLoanNotRepaid);

        // Account will be closed automatically via close constraint
        msg!("Flash loan state closed");
        Ok(())
    }
}

// ========== ACCOUNTS ==========

#[derive(Accounts)]
#[instruction(amount: u64, slot: u64)]
pub struct FlashBorrow<'info> {
    #[account(
        init,
        payer = borrower,
        space = 8 + FlashLoanState::INIT_SPACE,
        seeds = [b"flash", borrower.key().as_ref(), &slot.to_le_bytes()],
        bump
    )]
    pub flash_state: Account<'info, FlashLoanState>,
    /// CHECK: LP Pool (owned by LP program - validated manually)
    #[account(mut)]
    pub lp_pool: UncheckedAccount<'info>,
    /// CHECK: Borrowable config (owned by core program - validated manually)
    pub borrowable: UncheckedAccount<'info>,
    /// LP Vault
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlashRepay<'info> {
    #[account(
        mut,
        seeds = [b"flash", borrower.key().as_ref(), &flash_state.initiated_slot.to_le_bytes()],
        bump = flash_state.bump,
        has_one = borrower
    )]
    pub flash_state: Account<'info, FlashLoanState>,
    /// CHECK: LP Pool (owned by LP program - validated manually)
    #[account(mut)]
    pub lp_pool: UncheckedAccount<'info>,
    /// CHECK: Protocol (owned by core program - validated manually)
    pub protocol: UncheckedAccount<'info>,
    /// LP Vault
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseFlashState<'info> {
    #[account(
        mut,
        close = borrower,
        seeds = [b"flash", borrower.key().as_ref(), &flash_state.initiated_slot.to_le_bytes()],
        bump = flash_state.bump,
        has_one = borrower
    )]
    pub flash_state: Account<'info, FlashLoanState>,
    #[account(mut)]
    pub borrower: Signer<'info>,
}
