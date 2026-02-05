use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

use legasi_core::{constants::*, errors::LegasiError, events::*, state::*};

declare_id!("4g7FgDLuxXJ7fRa57m8SV3gjznMZ9KUjcdJfg1b6BfPF");

#[program]
pub mod legasi_lp {
    use super::*;

    /// Initialize an LP pool for a borrowable asset (e.g., USDC → bUSDC)
    /// Step 1: Create the pool PDA
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.lp_pool;
        pool.borrowable_mint = ctx.accounts.borrowable_mint.key();
        pool.lp_token_mint = Pubkey::default(); // Set in step 2
        pool.total_deposits = 0;
        pool.total_shares = 0;
        pool.total_borrowed = 0;
        pool.interest_earned = 0;
        pool.bump = ctx.bumps.lp_pool;

        msg!("LP pool created for {}", ctx.accounts.borrowable_mint.key());
        Ok(())
    }

    /// Initialize LP pool accounts (mint + vault)
    /// Step 2: Create the LP token mint and vault
    pub fn initialize_pool_accounts(ctx: Context<InitializePoolAccounts>) -> Result<()> {
        let pool = &mut ctx.accounts.lp_pool;
        pool.lp_token_mint = ctx.accounts.lp_token_mint.key();

        msg!("LP pool accounts initialized");
        Ok(())
    }

    /// Deposit stablecoins, receive LP tokens (e.g., deposit USDC, get bUSDC)
    pub fn deposit(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
        require!(amount > 0, LegasiError::InvalidAmount);

        let pool = &ctx.accounts.lp_pool;

        // Calculate shares to mint
        // If first deposit: 1:1
        // Otherwise: shares = amount * total_shares / total_deposits
        let shares_to_mint = if pool.total_shares == 0 {
            amount
        } else {
            (amount as u128)
                .checked_mul(pool.total_shares as u128)
                .ok_or(LegasiError::MathOverflow)?
                .checked_div(pool.total_deposits as u128)
                .ok_or(LegasiError::MathOverflow)? as u64
        };

        require!(shares_to_mint > 0, LegasiError::InvalidAmount);

        // Transfer tokens from user to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
        )?;

        // Mint LP tokens to user
        let pool_bump = ctx.accounts.lp_pool.bump;
        let borrowable_mint = ctx.accounts.lp_pool.borrowable_mint;
        let seeds: &[&[u8]] = &[b"lp_pool", borrowable_mint.as_ref(), &[pool_bump]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_token_mint.to_account_info(),
                    to: ctx.accounts.user_lp_token_account.to_account_info(),
                    authority: ctx.accounts.lp_pool.to_account_info(),
                },
                &[seeds],
            ),
            shares_to_mint,
        )?;

        // Update pool state
        let pool = &mut ctx.accounts.lp_pool;
        pool.total_deposits = pool
            .total_deposits
            .checked_add(amount)
            .ok_or(LegasiError::MathOverflow)?;
        pool.total_shares = pool
            .total_shares
            .checked_add(shares_to_mint)
            .ok_or(LegasiError::MathOverflow)?;

        emit!(LpDeposited {
            depositor: ctx.accounts.depositor.key(),
            pool: ctx.accounts.lp_pool.key(),
            amount,
            shares_minted: shares_to_mint,
        });

        msg!(
            "Deposited {} tokens, received {} LP shares",
            amount,
            shares_to_mint
        );
        Ok(())
    }

    /// Withdraw by burning LP tokens (e.g., burn bUSDC, get USDC + yield)
    pub fn withdraw(ctx: Context<LpWithdraw>, shares_amount: u64) -> Result<()> {
        require!(shares_amount > 0, LegasiError::InvalidAmount);

        let pool = &ctx.accounts.lp_pool;
        require!(pool.total_shares > 0, LegasiError::NoLpShares);

        // Calculate tokens to return
        // tokens = shares * total_deposits / total_shares
        let tokens_to_return = (shares_amount as u128)
            .checked_mul(pool.total_deposits as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(pool.total_shares as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        require!(tokens_to_return > 0, LegasiError::InvalidAmount);
        require!(
            ctx.accounts.vault.amount >= tokens_to_return,
            LegasiError::InsufficientLiquidity
        );

        // Burn LP tokens from user
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_token_mint.to_account_info(),
                    from: ctx.accounts.user_lp_token_account.to_account_info(),
                    authority: ctx.accounts.withdrawer.to_account_info(),
                },
            ),
            shares_amount,
        )?;

        // Transfer tokens from vault to user
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
            tokens_to_return,
        )?;

        // Update pool state
        let pool = &mut ctx.accounts.lp_pool;
        pool.total_deposits = pool.total_deposits.saturating_sub(tokens_to_return);
        pool.total_shares = pool.total_shares.saturating_sub(shares_amount);

        emit!(LpWithdrawn {
            withdrawer: ctx.accounts.withdrawer.key(),
            pool: ctx.accounts.lp_pool.key(),
            shares_burned: shares_amount,
            amount_received: tokens_to_return,
        });

        msg!(
            "Withdrew {} LP shares, received {} tokens",
            shares_amount,
            tokens_to_return
        );
        Ok(())
    }

    /// Accrue interest to the pool (called by lending program)
    pub fn accrue_interest(ctx: Context<AccrueInterest>, interest_amount: u64) -> Result<()> {
        require!(interest_amount > 0, LegasiError::InvalidAmount);

        // Calculate insurance fee (5%)
        let insurance_fee = interest_amount
            .checked_mul(INSURANCE_FEE_BPS)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(LegasiError::MathOverflow)?;

        let lp_interest = interest_amount.saturating_sub(insurance_fee);

        // Update pool - interest increases total_deposits without changing shares
        // This automatically increases the value of each LP token
        let pool = &mut ctx.accounts.lp_pool;
        pool.total_deposits = pool
            .total_deposits
            .checked_add(lp_interest)
            .ok_or(LegasiError::MathOverflow)?;
        pool.interest_earned = pool
            .interest_earned
            .checked_add(lp_interest)
            .ok_or(LegasiError::MathOverflow)?;

        // Update protocol insurance fund
        let protocol = &mut ctx.accounts.protocol;
        protocol.insurance_fund = protocol
            .insurance_fund
            .checked_add(insurance_fee)
            .ok_or(LegasiError::MathOverflow)?;

        msg!(
            "Accrued {} interest ({} to LPs, {} to insurance)",
            interest_amount,
            lp_interest,
            insurance_fee
        );
        Ok(())
    }

    /// Get current exchange rate (tokens per LP share)
    pub fn get_exchange_rate(ctx: Context<GetExchangeRate>) -> Result<u64> {
        let pool = &ctx.accounts.lp_pool;

        if pool.total_shares == 0 {
            return Ok(USD_MULTIPLIER); // 1:1 for empty pool
        }

        let rate = (pool.total_deposits as u128)
            .checked_mul(USD_MULTIPLIER as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(pool.total_shares as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        Ok(rate)
    }
}

// ========== ACCOUNTS ==========

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + LpPool::INIT_SPACE,
        seeds = [b"lp_pool", borrowable_mint.key().as_ref()],
        bump
    )]
    pub lp_pool: Account<'info, LpPool>,
    pub borrowable_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePoolAccounts<'info> {
    #[account(
        mut,
        seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Box<Account<'info, LpPool>>,
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = lp_pool,
        seeds = [b"lp_token", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub lp_token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        token::mint = borrowable_mint,
        token::authority = lp_pool,
        seeds = [b"lp_vault", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    /// The original borrowable mint (USDC, etc.)
    pub borrowable_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LpDeposit<'info> {
    #[account(
        mut,
        seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,
    #[account(
        mut,
        seeds = [b"lp_token", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub lp_token_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"lp_vault", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_lp_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct LpWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,
    #[account(
        mut,
        seeds = [b"lp_token", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub lp_token_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"lp_vault", lp_pool.borrowable_mint.as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_lp_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub withdrawer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AccrueInterest<'info> {
    #[account(
        mut,
        seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()],
        bump = lp_pool.bump
    )]
    pub lp_pool: Account<'info, LpPool>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: Lending program authority
    pub lending_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetExchangeRate<'info> {
    #[account(seeds = [b"lp_pool", lp_pool.borrowable_mint.as_ref()], bump = lp_pool.bump)]
    pub lp_pool: Account<'info, LpPool>,
}
