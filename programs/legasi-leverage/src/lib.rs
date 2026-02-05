use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use legasi_core::{constants::*, errors::LegasiError, events::*, state::*};

declare_id!("AVATHjGrdQ1KqtjHQ4gwRcuAYjwwScwgPsujLDpiA2g3");

/// Leverage position tracking
#[account]
#[derive(InitSpace)]
pub struct LeveragePosition {
    pub owner: Pubkey,
    pub position: Pubkey, // Reference to main Position account
    pub collateral_type: AssetType,
    pub borrow_type: AssetType,
    pub initial_collateral: u64,
    pub total_collateral: u64,
    pub total_borrowed: u64,
    pub leverage_multiplier: u8, // 2x, 3x, 4x, 5x
    pub entry_price_usd: u64,    // Price when opened
    pub is_long: bool,
    pub is_active: bool,
    pub opened_at: i64,
    pub bump: u8,
}

#[program]
pub mod legasi_leverage {
    use super::*;

    /// Open a leveraged long position
    /// Example: 5 SOL at 3x = deposit 5 SOL, borrow USDC, swap to SOL, deposit again (loop)
    /// Result: 15 SOL exposure, 10 SOL worth of USDC debt
    pub fn open_long(
        ctx: Context<OpenLong>,
        initial_collateral: u64,
        leverage_multiplier: u8,
        min_collateral_received: u64, // Slippage protection
    ) -> Result<()> {
        require!(initial_collateral > 0, LegasiError::InvalidAmount);
        require!(
            leverage_multiplier >= 2 && leverage_multiplier <= 5,
            LegasiError::InvalidAmount
        );

        let sol_price = ctx.accounts.sol_price_feed.price_usd_6dec;

        // Calculate amounts
        // For 3x leverage: borrow 2x of initial collateral value
        let borrow_multiplier = (leverage_multiplier - 1) as u64;
        let collateral_value_usd = (initial_collateral as u128)
            .checked_mul(sol_price as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(LAMPORTS_PER_SOL as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        let usdc_to_borrow = collateral_value_usd
            .checked_mul(borrow_multiplier)
            .ok_or(LegasiError::MathOverflow)?;

        // Check liquidity
        require!(
            ctx.accounts.usdc_vault.amount >= usdc_to_borrow,
            LegasiError::InsufficientLiquidity
        );

        // 1. Transfer initial SOL collateral from user
        invoke(
            &system_instruction::transfer(
                ctx.accounts.owner.key,
                ctx.accounts.sol_vault.key,
                initial_collateral,
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // 2. Borrow USDC (sent to user for swap)
        let protocol_bump = ctx.accounts.protocol.bump;
        let seeds: &[&[u8]] = &[b"protocol", &[protocol_bump]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.user_usdc_account.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
            ),
            usdc_to_borrow,
        )?;

        // 3. User swaps USDC → SOL off-chain (via Jupiter/Raydium)
        // 4. User deposits additional SOL via deposit_sol instruction

        // Calculate expected final collateral (with some buffer for slippage)
        let expected_total_sol = initial_collateral
            .checked_mul(leverage_multiplier as u64)
            .ok_or(LegasiError::MathOverflow)?;

        require!(
            expected_total_sol >= min_collateral_received,
            LegasiError::SlippageExceeded
        );

        // Initialize leverage position
        let leverage_pos = &mut ctx.accounts.leverage_position;
        leverage_pos.owner = ctx.accounts.owner.key();
        leverage_pos.position = ctx.accounts.position.key();
        leverage_pos.collateral_type = AssetType::SOL;
        leverage_pos.borrow_type = AssetType::USDC;
        leverage_pos.initial_collateral = initial_collateral;
        leverage_pos.total_collateral = initial_collateral; // Will be updated after swap
        leverage_pos.total_borrowed = usdc_to_borrow;
        leverage_pos.leverage_multiplier = leverage_multiplier;
        leverage_pos.entry_price_usd = sol_price;
        leverage_pos.is_long = true;
        leverage_pos.is_active = true;
        leverage_pos.opened_at = Clock::get()?.unix_timestamp;
        leverage_pos.bump = ctx.bumps.leverage_position;

        // Update main position
        let position = &mut ctx.accounts.position;

        // Add collateral
        let found = position
            .collaterals
            .iter_mut()
            .find(|c| c.asset_type == AssetType::SOL);
        if let Some(deposit) = found {
            deposit.amount = deposit
                .amount
                .checked_add(initial_collateral)
                .ok_or(LegasiError::MathOverflow)?;
        } else {
            require!(
                position.collaterals.len() < MAX_COLLATERAL_TYPES,
                LegasiError::MaxCollateralTypesReached
            );
            position.collaterals.push(CollateralDeposit {
                asset_type: AssetType::SOL,
                amount: initial_collateral,
            });
        }

        // Add borrow
        let found = position
            .borrows
            .iter_mut()
            .find(|b| b.asset_type == AssetType::USDC);
        if let Some(borrow) = found {
            borrow.amount = borrow
                .amount
                .checked_add(usdc_to_borrow)
                .ok_or(LegasiError::MathOverflow)?;
        } else {
            require!(
                position.borrows.len() < MAX_BORROW_TYPES,
                LegasiError::MaxBorrowTypesReached
            );
            position.borrows.push(BorrowedAmount {
                asset_type: AssetType::USDC,
                amount: usdc_to_borrow,
                accrued_interest: 0,
            });
        }

        position.last_update = Clock::get()?.unix_timestamp;

        emit!(LeverageOpened {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            collateral_type: AssetType::SOL,
            borrow_type: AssetType::USDC,
            initial_collateral,
            total_collateral: initial_collateral,
            total_borrowed: usdc_to_borrow,
            leverage_multiplier,
        });

        msg!(
            "Opened {}x long: {} SOL, borrowed {} USDC",
            leverage_multiplier,
            initial_collateral as f64 / LAMPORTS_PER_SOL as f64,
            usdc_to_borrow as f64 / USD_MULTIPLIER as f64
        );
        Ok(())
    }

    /// Close leveraged position - repay debt, withdraw collateral
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        let leverage_pos = &ctx.accounts.leverage_position;
        require!(leverage_pos.is_active, LegasiError::PositionNotFound);

        let sol_price = ctx.accounts.sol_price_feed.price_usd_6dec;

        // Calculate PnL
        let entry_value_usd = (leverage_pos.total_collateral as u128)
            .checked_mul(leverage_pos.entry_price_usd as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(LAMPORTS_PER_SOL as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        let current_value_usd = (leverage_pos.total_collateral as u128)
            .checked_mul(sol_price as u128)
            .ok_or(LegasiError::MathOverflow)?
            .checked_div(LAMPORTS_PER_SOL as u128)
            .ok_or(LegasiError::MathOverflow)? as u64;

        // PnL = current_value - entry_value - debt
        let pnl_usd: i64 = (current_value_usd as i64)
            .saturating_sub(entry_value_usd as i64)
            .saturating_sub(leverage_pos.total_borrowed as i64);

        // User needs to have USDC to repay
        let position = &ctx.accounts.position;
        let usdc_borrow = position
            .borrows
            .iter()
            .find(|b| b.asset_type == AssetType::USDC)
            .ok_or(LegasiError::PositionNotFound)?;

        let total_owed = usdc_borrow
            .amount
            .checked_add(usdc_borrow.accrued_interest)
            .ok_or(LegasiError::MathOverflow)?;

        // Transfer USDC from user to repay
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc_account.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            total_owed,
        )?;

        // Update position - remove debt
        let position = &mut ctx.accounts.position;
        position.borrows.retain(|b| b.asset_type != AssetType::USDC);
        position.last_update = Clock::get()?.unix_timestamp;

        // Update reputation
        position.reputation.successful_repayments =
            position.reputation.successful_repayments.saturating_add(1);
        position.reputation.total_repaid_usd = position
            .reputation
            .total_repaid_usd
            .saturating_add(total_owed);

        // Mark leverage position as closed
        let leverage_pos = &mut ctx.accounts.leverage_position;
        leverage_pos.is_active = false;

        emit!(LeverageClosed {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            collateral_returned: leverage_pos.total_collateral,
            pnl_usd,
        });

        msg!(
            "Closed leverage position. PnL: ${}",
            pnl_usd as f64 / USD_MULTIPLIER as f64
        );
        Ok(())
    }

    /// Update collateral amount after swap (called after user swaps and deposits)
    pub fn update_leverage_collateral(
        ctx: Context<UpdateLeverageCollateral>,
        new_total_collateral: u64,
    ) -> Result<()> {
        let leverage_pos = &mut ctx.accounts.leverage_position;
        require!(leverage_pos.is_active, LegasiError::PositionNotFound);
        require!(
            new_total_collateral >= leverage_pos.initial_collateral,
            LegasiError::InvalidAmount
        );

        leverage_pos.total_collateral = new_total_collateral;

        msg!(
            "Updated leverage collateral to {} SOL",
            new_total_collateral as f64 / LAMPORTS_PER_SOL as f64
        );
        Ok(())
    }
}

// ========== ACCOUNTS ==========

#[derive(Accounts)]
pub struct OpenLong<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + LeveragePosition::INIT_SPACE,
        seeds = [b"leverage", position.key().as_ref()],
        bump
    )]
    pub leverage_position: Account<'info, LeveragePosition>,
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: SOL vault PDA
    #[account(
        mut,
        seeds = [b"sol_vault", position.key().as_ref()],
        bump
    )]
    pub sol_vault: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"borrow_vault", usdc_mint.key().as_ref()],
        bump
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,
    #[account(seeds = [b"price", &[AssetType::SOL as u8]], bump)]
    pub sol_price_feed: Account<'info, PriceFeed>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        mut,
        seeds = [b"leverage", position.key().as_ref()],
        bump = leverage_position.bump,
        has_one = owner
    )]
    pub leverage_position: Account<'info, LeveragePosition>,
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        seeds = [b"borrow_vault", usdc_mint.key().as_ref()],
        bump
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub user_usdc_account: Account<'info, TokenAccount>,
    #[account(seeds = [b"price", &[AssetType::SOL as u8]], bump)]
    pub sol_price_feed: Account<'info, PriceFeed>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateLeverageCollateral<'info> {
    #[account(
        mut,
        seeds = [b"leverage", position.key().as_ref()],
        bump = leverage_position.bump,
        has_one = owner
    )]
    pub leverage_position: Account<'info, LeveragePosition>,
    #[account(
        seeds = [b"position", owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    pub owner: Signer<'info>,
}
