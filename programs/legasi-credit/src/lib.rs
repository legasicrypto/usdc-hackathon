use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn};

declare_id!("FH8VWbL8nbjU2wU7uauc883Z11wdxtjr8GKfvamPR5Lf");

// Constants
const MAX_LTV_BPS: u64 = 5000; // 50% max LTV
const GAD_START_LTV_BPS: u64 = 5000; // GAD starts at 50%
const SECONDS_PER_DAY: i64 = 86400;
const INSURANCE_FEE_BPS: u64 = 500; // 5% of interest goes to insurance
const BUSDC_DECIMALS: u8 = 6;
const MAX_LEVERAGE_MULTIPLIER: u64 = 5; // Max 5x leverage
const MIN_LEVERAGE_MULTIPLIER: u64 = 2; // Min 2x leverage

// Jito staking constants
const JITO_STAKE_ENABLED: bool = true;
const JITO_YIELD_BPS: u64 = 700; // ~7% APY (approximate)

/// GAD continuous curve (LIF-style)
fn get_gad_rate_bps(ltv_bps: u64, start_ltv_bps: u64) -> u64 {
    if ltv_bps <= start_ltv_bps {
        return 0;
    }
    let excess = ltv_bps.saturating_sub(start_ltv_bps);
    // Quadratic curve: rate = excess^2 / 100, capped at 1000 bps/day
    let rate = (excess as u128).pow(2).checked_div(100).unwrap_or(0) as u64;
    std::cmp::min(rate, 1000)
}

/// Calculate staking yield based on amount and time elapsed
/// Returns yield in lamports
fn calculate_staking_yield(staked_amount: u64, elapsed_seconds: i64) -> u64 {
    if staked_amount == 0 || elapsed_seconds <= 0 {
        return 0;
    }
    // yield = staked_amount * (JITO_YIELD_BPS / 10000) * (elapsed / SECONDS_PER_YEAR)
    // Simplified: yield = staked_amount * JITO_YIELD_BPS * elapsed / (10000 * 31536000)
    let seconds_per_year: u128 = 31_536_000;
    let yield_amount = (staked_amount as u128)
        .checked_mul(JITO_YIELD_BPS as u128)
        .unwrap_or(0)
        .checked_mul(elapsed_seconds as u128)
        .unwrap_or(0)
        .checked_div(10000)
        .unwrap_or(0)
        .checked_div(seconds_per_year)
        .unwrap_or(0);
    yield_amount as u64
}

#[program]
pub mod legasi_credit {
    use super::*;

    /// Initialize the protocol
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, sol_price_usd: u64) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.admin = ctx.accounts.admin.key();
        protocol.sol_price_usd_6dec = sol_price_usd;
        protocol.last_price_update = Clock::get()?.unix_timestamp;
        protocol.total_collateral = 0;
        protocol.total_borrowed = 0;
        protocol.treasury = ctx.accounts.treasury.key();
        protocol.usdc_mint = ctx.accounts.usdc_mint.key();
        protocol.busdc_mint = Pubkey::default();
        protocol.total_lp_deposits = 0;
        protocol.total_lp_shares = 0;
        protocol.insurance_fund = 0;
        protocol.total_interest_earned = 0;
        protocol.bump = ctx.bumps.protocol;
        
        msg!("Protocol initialized");
        Ok(())
    }

    /// Initialize LP system with bUSDC mint
    pub fn initialize_lp(ctx: Context<InitializeLp>) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.busdc_mint = ctx.accounts.busdc_mint.key();
        msg!("LP system initialized with bUSDC: {}", protocol.busdc_mint);
        Ok(())
    }

    /// LP deposits USDC, receives bUSDC tokens
    pub fn lp_deposit(ctx: Context<LpDeposit>, usdc_amount: u64) -> Result<()> {
        require!(usdc_amount > 0, ErrorCode::InvalidAmount);
        
        let protocol = &ctx.accounts.protocol;
        
        // Calculate shares: if first deposit, 1:1; else proportional
        let shares_to_mint = if protocol.total_lp_shares == 0 {
            usdc_amount
        } else {
            (usdc_amount as u128)
                .checked_mul(protocol.total_lp_shares as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(protocol.total_lp_deposits as u128)
                .ok_or(ErrorCode::MathOverflow)? as u64
        };
        
        require!(shares_to_mint > 0, ErrorCode::InvalidAmount);
        
        // Transfer USDC from user to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            usdc_amount,
        )?;
        
        // Mint bUSDC to user
        let bump = ctx.accounts.protocol.bump;
        let seeds: &[&[u8]] = &[b"protocol", &[bump]];
        
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.busdc_mint.to_account_info(),
                    to: ctx.accounts.user_busdc.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
            ),
            shares_to_mint,
        )?;
        
        // Update protocol
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_lp_deposits = protocol.total_lp_deposits.checked_add(usdc_amount).ok_or(ErrorCode::MathOverflow)?;
        protocol.total_lp_shares = protocol.total_lp_shares.checked_add(shares_to_mint).ok_or(ErrorCode::MathOverflow)?;
        
        msg!("LP deposited {} USDC, received {} bUSDC", usdc_amount, shares_to_mint);
        
        emit!(LpDepositEvent {
            depositor: ctx.accounts.depositor.key(),
            usdc_amount,
            shares_minted: shares_to_mint,
        });
        
        Ok(())
    }

    /// LP burns bUSDC, receives USDC + yield
    pub fn lp_withdraw(ctx: Context<LpWithdraw>, shares_amount: u64) -> Result<()> {
        require!(shares_amount > 0, ErrorCode::InvalidAmount);
        
        let protocol = &ctx.accounts.protocol;
        require!(protocol.total_lp_shares > 0, ErrorCode::NoLpShares);
        
        // Calculate USDC to return
        let usdc_to_return = (shares_amount as u128)
            .checked_mul(protocol.total_lp_deposits as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(protocol.total_lp_shares as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        require!(usdc_to_return > 0, ErrorCode::InvalidAmount);
        require!(ctx.accounts.usdc_vault.amount >= usdc_to_return, ErrorCode::InsufficientLiquidity);
        
        // Burn bUSDC
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.busdc_mint.to_account_info(),
                    from: ctx.accounts.user_busdc.to_account_info(),
                    authority: ctx.accounts.withdrawer.to_account_info(),
                },
            ),
            shares_amount,
        )?;
        
        // Transfer USDC to user
        let bump = ctx.accounts.protocol.bump;
        let seeds: &[&[u8]] = &[b"protocol", &[bump]];
        
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
            ),
            usdc_to_return,
        )?;
        
        // Update protocol
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_lp_deposits = protocol.total_lp_deposits.saturating_sub(usdc_to_return);
        protocol.total_lp_shares = protocol.total_lp_shares.saturating_sub(shares_amount);
        
        msg!("LP withdrew {} bUSDC, received {} USDC", shares_amount, usdc_to_return);
        
        emit!(LpWithdrawEvent {
            withdrawer: ctx.accounts.withdrawer.key(),
            shares_burned: shares_amount,
            usdc_received: usdc_to_return,
        });
        
        Ok(())
    }

    /// Update SOL price
    pub fn update_price(ctx: Context<UpdatePrice>, new_price_usd: u64) -> Result<()> {
        require!(new_price_usd > 0, ErrorCode::InvalidAmount);
        let protocol = &mut ctx.accounts.protocol;
        protocol.sol_price_usd_6dec = new_price_usd;
        protocol.last_price_update = Clock::get()?.unix_timestamp;
        msg!("Price updated to ${}", new_price_usd / 1_000_000);
        Ok(())
    }

    /// Initialize position
    pub fn initialize_position(ctx: Context<InitializePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let now = Clock::get()?.unix_timestamp;
        position.owner = ctx.accounts.owner.key();
        position.collateral_amount = 0;
        position.staked_amount = 0;
        position.last_stake_update = now;
        position.accumulated_yield = 0;
        position.borrowed_amount = 0;
        position.last_update = now;
        position.last_gad_crank = now;
        position.gad_config = GadConfig::default();
        position.total_gad_liquidated = 0;
        position.reputation = Reputation::default();
        position.bump = ctx.bumps.position;
        msg!("Position initialized for {}", position.owner);
        Ok(())
    }

    /// Configure GAD
    pub fn configure_gad(ctx: Context<ConfigureGad>, enabled: bool, custom_start_ltv_bps: Option<u64>, min_collateral_floor: Option<u64>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        position.gad_config.enabled = enabled;
        if let Some(ltv) = custom_start_ltv_bps {
            require!(ltv >= 4000 && ltv <= 7000, ErrorCode::InvalidGadConfig);
            position.gad_config.custom_start_ltv_bps = ltv;
        }
        if let Some(floor) = min_collateral_floor {
            position.gad_config.min_collateral_floor = floor;
        }
        msg!("GAD configured");
        Ok(())
    }

    /// Deposit SOL collateral
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        invoke(
            &system_instruction::transfer(ctx.accounts.owner.key, ctx.accounts.collateral_vault.key, amount),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        let position = &mut ctx.accounts.position;
        position.collateral_amount = position.collateral_amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        position.last_update = Clock::get()?.unix_timestamp;
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        
        msg!("Deposited {} lamports", amount);
        Ok(())
    }
    
    /// Deposit SOL and auto-stake via Jito for yield
    /// SOL is deposited to vault and tracked as staked for yield calculation
    pub fn deposit_and_stake(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(JITO_STAKE_ENABLED, ErrorCode::StakingDisabled);
        
        // Capture key before mutable borrow
        let position_key = ctx.accounts.position.key();
        let now = Clock::get()?.unix_timestamp;
        
        // First, accrue any pending yield
        let position = &mut ctx.accounts.position;
        
        if position.staked_amount > 0 && position.last_stake_update > 0 {
            let elapsed = now.saturating_sub(position.last_stake_update);
            let yield_amount = calculate_staking_yield(position.staked_amount, elapsed);
            position.accumulated_yield = position.accumulated_yield.saturating_add(yield_amount);
        }
        
        // Transfer SOL to vault
        invoke(
            &system_instruction::transfer(ctx.accounts.owner.key, ctx.accounts.collateral_vault.key, amount),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        // Update position: all new deposits are auto-staked
        position.collateral_amount = position.collateral_amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        position.staked_amount = position.staked_amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        position.last_stake_update = now;
        position.last_update = now;
        
        // Capture final values for event
        let final_staked = position.staked_amount;
        let final_yield = position.accumulated_yield;
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        
        emit!(StakeEvent {
            position: position_key,
            amount_staked: amount,
            total_staked: final_staked,
            accumulated_yield: final_yield,
        });
        
        msg!("Deposited and staked {} SOL via Jito", amount / 1_000_000_000);
        Ok(())
    }
    
    /// Claim accumulated staking yield
    pub fn claim_staking_yield(ctx: Context<ClaimYield>) -> Result<()> {
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.collateral_vault;
        
        // Calculate pending yield
        let position = &mut ctx.accounts.position;
        let now = Clock::get()?.unix_timestamp;
        
        if position.staked_amount > 0 && position.last_stake_update > 0 {
            let elapsed = now.saturating_sub(position.last_stake_update);
            let yield_amount = calculate_staking_yield(position.staked_amount, elapsed);
            position.accumulated_yield = position.accumulated_yield.saturating_add(yield_amount);
        }
        position.last_stake_update = now;
        
        let claimable = position.accumulated_yield;
        require!(claimable > 0, ErrorCode::NoYieldToClaim);
        
        // Reset accumulated yield
        position.accumulated_yield = 0;
        position.last_update = now;
        
        // Transfer yield to user
        let seeds: &[&[u8]] = &[b"vault", position_key.as_ref(), &[vault_bump]];
        
        invoke_signed(
            &system_instruction::transfer(ctx.accounts.collateral_vault.key, ctx.accounts.owner.key, claimable),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;
        
        emit!(YieldClaimedEvent {
            position: position_key,
            amount_claimed: claimable,
            remaining_staked: position.staked_amount,
        });
        
        msg!("Claimed {} SOL in staking yield", claimable / 1_000_000_000);
        Ok(())
    }

    /// Borrow USDC
    pub fn borrow(ctx: Context<BorrowUsdc>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(ctx.accounts.usdc_vault.amount >= amount, ErrorCode::InsufficientLiquidity);
        
        let position = &ctx.accounts.position;
        let protocol = &ctx.accounts.protocol;
        
        // Calculate max borrow with reputation bonus
        let base_ltv = MAX_LTV_BPS;
        let bonus = position.reputation.get_ltv_bonus_bps();
        let effective_ltv = base_ltv.saturating_add(bonus);
        
        let collateral_value = (position.collateral_amount as u128)
            .checked_mul(protocol.sol_price_usd_6dec as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let max_borrow = collateral_value
            .checked_mul(effective_ltv as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let new_borrowed = position.borrowed_amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        require!(new_borrowed <= max_borrow, ErrorCode::ExceedsLTV);
        
        // Transfer USDC
        let bump = protocol.bump;
        let seeds: &[&[u8]] = &[b"protocol", &[bump]];
        
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        
        let position = &mut ctx.accounts.position;
        position.borrowed_amount = new_borrowed;
        position.last_update = Clock::get()?.unix_timestamp;
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_borrowed = protocol.total_borrowed.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        
        msg!("Borrowed {} USDC", amount);
        Ok(())
    }

    /// Repay USDC
    pub fn repay(ctx: Context<RepayUsdc>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let position = &ctx.accounts.position;
        let repay_amount = std::cmp::min(amount, position.borrowed_amount);
        
        // Transfer USDC
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            repay_amount,
        )?;
        
        // Update position
        let position = &mut ctx.accounts.position;
        position.borrowed_amount = position.borrowed_amount.saturating_sub(repay_amount);
        position.last_update = Clock::get()?.unix_timestamp;
        position.reputation.successful_repayments = position.reputation.successful_repayments.saturating_add(1);
        position.reputation.total_repaid = position.reputation.total_repaid.saturating_add(repay_amount);
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_borrowed = protocol.total_borrowed.saturating_sub(repay_amount);
        
        msg!("Repaid {} USDC", repay_amount);
        Ok(())
    }

    /// Withdraw collateral
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let position = &ctx.accounts.position;
        let protocol = &ctx.accounts.protocol;
        require!(amount <= position.collateral_amount, ErrorCode::InsufficientCollateral);
        
        let remaining = position.collateral_amount.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;
        
        // Check LTV after withdrawal
        if position.borrowed_amount > 0 {
            let remaining_value = (remaining as u128)
                .checked_mul(protocol.sol_price_usd_6dec as u128)
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
        
        require!(remaining >= position.gad_config.min_collateral_floor, ErrorCode::BelowCollateralFloor);
        
        // Transfer SOL
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let seeds: &[&[u8]] = &[b"vault", position_key.as_ref(), &[vault_bump]];
        
        invoke_signed(
            &system_instruction::transfer(ctx.accounts.collateral_vault.key, ctx.accounts.owner.key, amount),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;
        
        let position = &mut ctx.accounts.position;
        position.collateral_amount = remaining;
        position.last_update = Clock::get()?.unix_timestamp;
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.saturating_sub(amount);
        
        msg!("Withdrew {} lamports", amount);
        Ok(())
    }

    /// Flash loan
    pub fn flash_loan(ctx: Context<FlashLoan>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(ctx.accounts.usdc_vault.amount >= amount, ErrorCode::InsufficientLiquidity);
        
        let fee = std::cmp::max(amount.checked_mul(5).unwrap_or(0).checked_div(10000).unwrap_or(0), 1);
        
        let bump = ctx.accounts.protocol.bump;
        let seeds: &[&[u8]] = &[b"protocol", &[bump]];
        
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        
        emit!(FlashLoanInitiated { borrower: ctx.accounts.borrower.key(), amount, fee });
        msg!("Flash loan: {} USDC, fee: {}", amount, fee);
        Ok(())
    }

    /// Repay flash loan
    pub fn repay_flash_loan(ctx: Context<RepayFlashLoan>, amount: u64, fee: u64) -> Result<()> {
        let total = amount.checked_add(fee).ok_or(ErrorCode::MathOverflow)?;
        
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            total,
        )?;
        
        let protocol = &mut ctx.accounts.protocol;
        let insurance = fee.checked_mul(INSURANCE_FEE_BPS).unwrap_or(0).checked_div(10000).unwrap_or(0);
        protocol.insurance_fund = protocol.insurance_fund.saturating_add(insurance);
        protocol.total_lp_deposits = protocol.total_lp_deposits.saturating_add(fee.saturating_sub(insurance));
        
        emit!(FlashLoanRepaid { borrower: ctx.accounts.borrower.key(), amount, fee });
        msg!("Flash loan repaid");
        Ok(())
    }

    /// One-Click Leverage Long
    /// Deposits SOL collateral and borrows maximum USDC in one atomic operation.
    /// The borrowed USDC is intended to be swapped to SOL via Jupiter (client-side)
    /// and re-deposited for leverage looping.
    /// 
    /// Flow (client composes):
    /// 1. leverage_long(initial_sol, target_leverage) - deposits SOL, borrows USDC
    /// 2. Jupiter swap USDC → SOL (client instruction)
    /// 3. leverage_deposit_loop(swapped_sol) - deposits swapped SOL, borrows more USDC
    /// 4. Repeat 2-3 until target leverage reached
    pub fn leverage_long(
        ctx: Context<LeverageLong>,
        initial_sol_amount: u64,
        target_leverage_x10: u64, // e.g., 30 = 3.0x leverage
    ) -> Result<()> {
        require!(initial_sol_amount > 0, ErrorCode::InvalidAmount);
        require!(
            target_leverage_x10 >= MIN_LEVERAGE_MULTIPLIER * 10 && 
            target_leverage_x10 <= MAX_LEVERAGE_MULTIPLIER * 10,
            ErrorCode::InvalidLeverage
        );
        
        // Capture keys before mutable borrows
        let position_key = ctx.accounts.position.key();
        let protocol_bump = ctx.accounts.protocol.bump;
        let sol_price = ctx.accounts.protocol.sol_price_usd_6dec;
        let vault_amount = ctx.accounts.usdc_vault.amount;
        
        // Transfer SOL to vault
        invoke(
            &system_instruction::transfer(
                ctx.accounts.owner.key, 
                ctx.accounts.collateral_vault.key, 
                initial_sol_amount
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        // Update position collateral
        let position = &mut ctx.accounts.position;
        position.collateral_amount = position.collateral_amount.checked_add(initial_sol_amount).ok_or(ErrorCode::MathOverflow)?;
        position.last_update = Clock::get()?.unix_timestamp;
        
        // Calculate collateral value in USDC (6 decimals)
        let collateral_value = (position.collateral_amount as u128)
            .checked_mul(sol_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000) // SOL has 9 decimals
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Calculate max borrow with reputation bonus
        let base_ltv = MAX_LTV_BPS;
        let bonus = position.reputation.get_ltv_bonus_bps();
        let effective_ltv = base_ltv.saturating_add(bonus);
        
        let max_borrow = collateral_value
            .checked_mul(effective_ltv as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        // Calculate how much to borrow (max possible)
        let available_to_borrow = max_borrow.saturating_sub(position.borrowed_amount);
        let borrow_amount = std::cmp::min(available_to_borrow, vault_amount);
        
        require!(borrow_amount > 0, ErrorCode::InsufficientLiquidity);
        
        // Update position borrowed amount
        position.borrowed_amount = position.borrowed_amount.checked_add(borrow_amount).ok_or(ErrorCode::MathOverflow)?;
        
        // Capture final values for event
        let final_collateral = position.collateral_amount;
        let final_debt = position.borrowed_amount;
        
        // Calculate achieved leverage (x10 for precision)
        let current_leverage = if initial_sol_amount > 0 {
            (final_collateral as u128)
                .checked_mul(10)
                .unwrap_or(0)
                .checked_div(initial_sol_amount as u128)
                .unwrap_or(10) as u64
        } else {
            10 // 1x
        };
        
        // Transfer USDC to user
        let seeds: &[&[u8]] = &[b"protocol", &[protocol_bump]];
        
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
            ),
            borrow_amount,
        )?;
        
        // Update protocol
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.checked_add(initial_sol_amount).ok_or(ErrorCode::MathOverflow)?;
        protocol.total_borrowed = protocol.total_borrowed.checked_add(borrow_amount).ok_or(ErrorCode::MathOverflow)?;
        
        emit!(LeverageLongEvent {
            position: position_key,
            initial_deposit: initial_sol_amount,
            total_collateral: final_collateral,
            borrowed_usdc: borrow_amount,
            total_debt: final_debt,
            achieved_leverage_x10: current_leverage,
            target_leverage_x10,
        });
        
        msg!(
            "Leverage Long: deposited {} SOL, borrowed {} USDC, leverage {}x",
            initial_sol_amount / 1_000_000_000,
            borrow_amount / 1_000_000,
            current_leverage as f64 / 10.0
        );
        
        Ok(())
    }
    
    /// Deposit additional SOL (from Jupiter swap) and borrow more USDC
    /// Used as part of leverage looping
    pub fn leverage_deposit_loop(ctx: Context<LeverageDepositLoop>, sol_amount: u64) -> Result<()> {
        require!(sol_amount > 0, ErrorCode::InvalidAmount);
        
        // Capture keys and values before mutable borrows
        let position_key = ctx.accounts.position.key();
        let protocol_bump = ctx.accounts.protocol.bump;
        let sol_price = ctx.accounts.protocol.sol_price_usd_6dec;
        let vault_amount = ctx.accounts.usdc_vault.amount;
        
        // Transfer SOL to vault
        invoke(
            &system_instruction::transfer(
                ctx.accounts.owner.key, 
                ctx.accounts.collateral_vault.key, 
                sol_amount
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        // Update position
        let position = &mut ctx.accounts.position;
        position.collateral_amount = position.collateral_amount.checked_add(sol_amount).ok_or(ErrorCode::MathOverflow)?;
        position.last_update = Clock::get()?.unix_timestamp;
        
        // Calculate max borrow
        let collateral_value = (position.collateral_amount as u128)
            .checked_mul(sol_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let base_ltv = MAX_LTV_BPS;
        let bonus = position.reputation.get_ltv_bonus_bps();
        let effective_ltv = base_ltv.saturating_add(bonus);
        
        let max_borrow = collateral_value
            .checked_mul(effective_ltv as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let available_to_borrow = max_borrow.saturating_sub(position.borrowed_amount);
        let borrow_amount = std::cmp::min(available_to_borrow, vault_amount);
        
        if borrow_amount > 0 {
            // Transfer USDC
            let seeds: &[&[u8]] = &[b"protocol", &[protocol_bump]];
            
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.usdc_vault.to_account_info(),
                        to: ctx.accounts.user_usdc.to_account_info(),
                        authority: ctx.accounts.protocol.to_account_info(),
                    },
                    &[seeds],
                ),
                borrow_amount,
            )?;
            
            position.borrowed_amount = position.borrowed_amount.checked_add(borrow_amount).ok_or(ErrorCode::MathOverflow)?;
        }
        
        // Capture final values for event
        let final_collateral = position.collateral_amount;
        let final_debt = position.borrowed_amount;
        
        // Update protocol
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.checked_add(sol_amount).ok_or(ErrorCode::MathOverflow)?;
        if borrow_amount > 0 {
            protocol.total_borrowed = protocol.total_borrowed.checked_add(borrow_amount).ok_or(ErrorCode::MathOverflow)?;
        }
        
        emit!(LeverageLoopEvent {
            position: position_key,
            sol_deposited: sol_amount,
            usdc_borrowed: borrow_amount,
            total_collateral: final_collateral,
            total_debt: final_debt,
        });
        
        msg!("Leverage loop: +{} SOL, +{} USDC borrowed", sol_amount, borrow_amount);
        
        Ok(())
    }
    
    /// Deleverage: repay debt and withdraw collateral in one operation
    /// Used to unwind leveraged positions
    pub fn deleverage(ctx: Context<Deleverage>, usdc_repay_amount: u64, sol_withdraw_amount: u64) -> Result<()> {
        // Capture keys and values before mutable borrows
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let sol_price = ctx.accounts.protocol.sol_price_usd_6dec;
        let initial_borrowed = ctx.accounts.position.borrowed_amount;
        let initial_collateral = ctx.accounts.position.collateral_amount;
        let min_floor = ctx.accounts.position.gad_config.min_collateral_floor;
        
        // Repay USDC if amount > 0
        let actual_repay = std::cmp::min(usdc_repay_amount, initial_borrowed);
        if actual_repay > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_usdc.to_account_info(),
                        to: ctx.accounts.usdc_vault.to_account_info(),
                        authority: ctx.accounts.owner.to_account_info(),
                    },
                ),
                actual_repay,
            )?;
        }
        
        // Update position debt
        let position = &mut ctx.accounts.position;
        position.borrowed_amount = position.borrowed_amount.saturating_sub(actual_repay);
        position.last_update = Clock::get()?.unix_timestamp;
        if actual_repay > 0 {
            position.reputation.successful_repayments = position.reputation.successful_repayments.saturating_add(1);
            position.reputation.total_repaid = position.reputation.total_repaid.saturating_add(actual_repay);
        }
        
        // Check if withdrawal is safe
        let actual_withdraw = std::cmp::min(sol_withdraw_amount, initial_collateral);
        if actual_withdraw > 0 {
            let remaining = position.collateral_amount.saturating_sub(actual_withdraw);
            
            // Verify LTV after withdrawal
            if position.borrowed_amount > 0 {
                let remaining_value = (remaining as u128)
                    .checked_mul(sol_price as u128)
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
            
            require!(remaining >= min_floor, ErrorCode::BelowCollateralFloor);
            
            // Transfer SOL
            let seeds: &[&[u8]] = &[b"vault", position_key.as_ref(), &[vault_bump]];
            
            invoke_signed(
                &system_instruction::transfer(ctx.accounts.collateral_vault.key, ctx.accounts.owner.key, actual_withdraw),
                &[
                    ctx.accounts.collateral_vault.to_account_info(),
                    ctx.accounts.owner.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[seeds],
            )?;
            
            position.collateral_amount = remaining;
        }
        
        // Capture final values for event
        let final_collateral = position.collateral_amount;
        let final_debt = position.borrowed_amount;
        
        // Update protocol
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_borrowed = protocol.total_borrowed.saturating_sub(actual_repay);
        protocol.total_collateral = protocol.total_collateral.saturating_sub(actual_withdraw);
        
        emit!(DeleverageEvent {
            position: position_key,
            usdc_repaid: actual_repay,
            sol_withdrawn: actual_withdraw,
            remaining_collateral: final_collateral,
            remaining_debt: final_debt,
        });
        
        msg!("Deleveraged: repaid {} USDC, withdrew {} SOL", actual_repay, actual_withdraw);
        
        Ok(())
    }
    
    // ========== SHORT POSITION INSTRUCTIONS ==========
    
    /// Initialize short system vault (admin only)
    pub fn initialize_short_vault(_ctx: Context<InitializeShortVault>) -> Result<()> {
        msg!("Short vault initialized");
        Ok(())
    }
    
    /// Initialize a short position for the user
    pub fn initialize_short_position(ctx: Context<InitializeShortPosition>) -> Result<()> {
        let short_position = &mut ctx.accounts.short_position;
        short_position.owner = ctx.accounts.owner.key();
        short_position.usdc_collateral = 0;
        short_position.sol_borrowed = 0;
        short_position.entry_price = 0;
        short_position.last_update = Clock::get()?.unix_timestamp;
        short_position.gad_config = GadConfig::default();
        short_position.bump = ctx.bumps.short_position;
        msg!("Short position initialized for {}", short_position.owner);
        Ok(())
    }
    
    /// One-Click Leverage Short
    /// Deposits USDC collateral and borrows SOL in one atomic operation.
    /// The borrowed SOL is intended to be swapped to USDC via Jupiter (client-side).
    /// Profit when SOL price drops.
    /// 
    /// Flow (client composes):
    /// 1. leverage_short(usdc_amount, target_leverage) - deposits USDC, borrows SOL
    /// 2. Jupiter swap SOL → USDC (client instruction)
    /// 3. User keeps extra USDC, position tracks debt in SOL
    pub fn leverage_short(
        ctx: Context<LeverageShort>,
        usdc_amount: u64,
        target_leverage_x10: u64,
    ) -> Result<()> {
        require!(usdc_amount > 0, ErrorCode::InvalidAmount);
        require!(
            target_leverage_x10 >= MIN_LEVERAGE_MULTIPLIER * 10 && 
            target_leverage_x10 <= MAX_LEVERAGE_MULTIPLIER * 10,
            ErrorCode::InvalidLeverage
        );
        
        // Capture values before mutable borrows
        let short_position_key = ctx.accounts.short_position.key();
        let sol_price = ctx.accounts.protocol.sol_price_usd_6dec;
        
        // Transfer USDC from user to short collateral vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.short_collateral_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            usdc_amount,
        )?;
        
        // Update short position
        let short_position = &mut ctx.accounts.short_position;
        short_position.usdc_collateral = short_position.usdc_collateral.checked_add(usdc_amount).ok_or(ErrorCode::MathOverflow)?;
        short_position.last_update = Clock::get()?.unix_timestamp;
        
        // Calculate max SOL to borrow (50% LTV on USDC collateral)
        // usdc_collateral (6 dec) * LTV / sol_price (6 dec) * 10^9 = lamports
        let max_borrow_sol = (short_position.usdc_collateral as u128)
            .checked_mul(MAX_LTV_BPS as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(1_000_000_000) // Convert to lamports
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(sol_price as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let available_to_borrow = max_borrow_sol.saturating_sub(short_position.sol_borrowed);
        
        // Check how much SOL is available in the collateral vaults (from long positions)
        // For now, use the protocol's total_collateral as proxy
        let borrow_sol = std::cmp::min(available_to_borrow, ctx.accounts.protocol.total_collateral / 10); // Max 10% of total collateral
        
        require!(borrow_sol > 0, ErrorCode::InsufficientLiquidity);
        
        // Update borrowed amount and entry price
        if short_position.sol_borrowed == 0 {
            short_position.entry_price = sol_price;
        }
        short_position.sol_borrowed = short_position.sol_borrowed.checked_add(borrow_sol).ok_or(ErrorCode::MathOverflow)?;
        
        // Capture final values for event
        let final_collateral = short_position.usdc_collateral;
        let final_debt = short_position.sol_borrowed;
        
        // Transfer SOL from protocol's collateral pool to user
        // Note: In a real implementation, this would need a dedicated SOL lending pool
        // For hackathon, we simulate by transferring from treasury
        let bump = ctx.accounts.protocol.bump;
        let seeds: &[&[u8]] = &[b"protocol", &[bump]];
        
        // Transfer borrowed SOL to user (wrapped SOL or native)
        invoke_signed(
            &system_instruction::transfer(ctx.accounts.treasury.key, ctx.accounts.owner.key, borrow_sol),
            &[
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;
        
        // Update protocol
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_short_collateral_usdc = protocol.total_short_collateral_usdc.checked_add(usdc_amount).ok_or(ErrorCode::MathOverflow)?;
        protocol.total_short_borrowed_sol = protocol.total_short_borrowed_sol.checked_add(borrow_sol).ok_or(ErrorCode::MathOverflow)?;
        
        emit!(LeverageShortEvent {
            position: short_position_key,
            usdc_deposited: usdc_amount,
            sol_borrowed: borrow_sol,
            total_collateral: final_collateral,
            total_debt_sol: final_debt,
            entry_price: sol_price,
            target_leverage_x10,
        });
        
        msg!("Leverage Short: deposited {} USDC, borrowed {} SOL at ${}", 
            usdc_amount / 1_000_000,
            borrow_sol / 1_000_000_000,
            sol_price / 1_000_000
        );
        
        Ok(())
    }
    
    /// Close short position: repay SOL debt and withdraw USDC collateral
    pub fn close_short(ctx: Context<CloseShort>, sol_repay_amount: u64) -> Result<()> {
        // Capture values before mutable borrows
        let short_position_key = ctx.accounts.short_position.key();
        let initial_debt = ctx.accounts.short_position.sol_borrowed;
        let initial_collateral = ctx.accounts.short_position.usdc_collateral;
        let protocol_bump = ctx.accounts.protocol.bump;
        
        let actual_repay = std::cmp::min(sol_repay_amount, initial_debt);
        
        require!(actual_repay > 0, ErrorCode::InvalidAmount);
        
        // Transfer SOL from user back to treasury (repaying debt)
        invoke(
            &system_instruction::transfer(ctx.accounts.owner.key, ctx.accounts.treasury.key, actual_repay),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        // Update short position
        let short_position = &mut ctx.accounts.short_position;
        short_position.sol_borrowed = short_position.sol_borrowed.saturating_sub(actual_repay);
        short_position.last_update = Clock::get()?.unix_timestamp;
        
        // Calculate how much USDC can be withdrawn (proportional to debt repaid)
        let usdc_to_return = if initial_debt > 0 {
            (initial_collateral as u128)
                .checked_mul(actual_repay as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(initial_debt as u128)
                .ok_or(ErrorCode::MathOverflow)? as u64
        } else {
            0
        };
        
        // Transfer USDC back to user
        if usdc_to_return > 0 {
            let seeds: &[&[u8]] = &[b"protocol", &[protocol_bump]];
            
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.short_collateral_vault.to_account_info(),
                        to: ctx.accounts.user_usdc.to_account_info(),
                        authority: ctx.accounts.protocol.to_account_info(),
                    },
                    &[seeds],
                ),
                usdc_to_return,
            )?;
            
            short_position.usdc_collateral = short_position.usdc_collateral.saturating_sub(usdc_to_return);
        }
        
        // Capture final values
        let final_collateral = short_position.usdc_collateral;
        let final_debt = short_position.sol_borrowed;
        
        // Update protocol
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_short_collateral_usdc = protocol.total_short_collateral_usdc.saturating_sub(usdc_to_return);
        protocol.total_short_borrowed_sol = protocol.total_short_borrowed_sol.saturating_sub(actual_repay);
        
        emit!(CloseShortEvent {
            position: short_position_key,
            sol_repaid: actual_repay,
            usdc_returned: usdc_to_return,
            remaining_collateral: final_collateral,
            remaining_debt: final_debt,
        });
        
        msg!("Close short: repaid {} SOL, returned {} USDC", actual_repay, usdc_to_return);
        
        Ok(())
    }

    /// GAD Crank
    pub fn crank_gad(ctx: Context<CrankGad>) -> Result<()> {
        let position_key = ctx.accounts.position.key();
        let vault_bump = ctx.bumps.collateral_vault;
        let cranker_key = ctx.accounts.cranker.key();
        
        let position = &ctx.accounts.position;
        let protocol = &ctx.accounts.protocol;
        
        require!(position.gad_config.enabled, ErrorCode::GadDisabled);
        require!(position.borrowed_amount > 0, ErrorCode::NoDebtToDeleverage);
        
        let collateral_value = (position.collateral_amount as u128)
            .checked_mul(protocol.sol_price_usd_6dec as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000)
            .ok_or(ErrorCode::MathOverflow)?;
        
        require!(collateral_value > 0, ErrorCode::NoCollateral);
        
        let current_ltv = (position.borrowed_amount as u128)
            .checked_mul(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(collateral_value)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let start_ltv = position.gad_config.custom_start_ltv_bps;
        require!(current_ltv > start_ltv, ErrorCode::LtvBelowGadThreshold);
        
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.checked_sub(position.last_gad_crank).ok_or(ErrorCode::MathOverflow)?;
        require!(elapsed >= 3600, ErrorCode::CrankTooSoon);
        
        let gad_rate = get_gad_rate_bps(current_ltv, start_ltv);
        
        let liquidate_amount = (position.collateral_amount as u128)
            .checked_mul(gad_rate as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(elapsed as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(SECONDS_PER_DAY as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let max_liq = position.collateral_amount.saturating_sub(position.gad_config.min_collateral_floor);
        let actual_liq = std::cmp::min(liquidate_amount, max_liq);
        require!(actual_liq > 0, ErrorCode::NothingToLiquidate);
        
        let usdc_value = (actual_liq as u128)
            .checked_mul(protocol.sol_price_usd_6dec as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        
        let debt_reduction = std::cmp::min(usdc_value, position.borrowed_amount);
        let crank_reward = actual_liq / 200;
        let total_deduct = actual_liq.checked_add(crank_reward).ok_or(ErrorCode::MathOverflow)?;
        
        let seeds: &[&[u8]] = &[b"vault", position_key.as_ref(), &[vault_bump]];
        
        invoke_signed(
            &system_instruction::transfer(ctx.accounts.collateral_vault.key, ctx.accounts.treasury.key, actual_liq),
            &[
                ctx.accounts.collateral_vault.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[seeds],
        )?;
        
        if crank_reward > 0 {
            invoke_signed(
                &system_instruction::transfer(ctx.accounts.collateral_vault.key, ctx.accounts.cranker.key, crank_reward),
                &[
                    ctx.accounts.collateral_vault.to_account_info(),
                    ctx.accounts.cranker.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[seeds],
            )?;
        }
        
        let position = &mut ctx.accounts.position;
        position.collateral_amount = position.collateral_amount.saturating_sub(total_deduct);
        position.borrowed_amount = position.borrowed_amount.saturating_sub(debt_reduction);
        position.last_gad_crank = now;
        position.total_gad_liquidated = position.total_gad_liquidated.saturating_add(actual_liq);
        position.last_update = now;
        position.reputation.gad_events = position.reputation.gad_events.saturating_add(1);
        
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_collateral = protocol.total_collateral.saturating_sub(total_deduct);
        protocol.total_borrowed = protocol.total_borrowed.saturating_sub(debt_reduction);
        
        emit!(GadExecuted {
            position: position_key,
            collateral_liquidated: actual_liq,
            debt_reduced: debt_reduction,
            ltv_bps: current_ltv,
            gad_rate_bps: gad_rate,
            cranker: cranker_key,
            crank_reward,
        });
        
        msg!("GAD: liquidated {} lamports", actual_liq);
        Ok(())
    }
}

// ========== ACCOUNTS ==========

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(init, payer = admin, space = 8 + Protocol::INIT_SPACE, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: Treasury
    pub treasury: UncheckedAccount<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeLp<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(init, payer = admin, mint::decimals = BUSDC_DECIMALS, mint::authority = protocol, seeds = [b"busdc_mint"], bump)]
    pub busdc_mint: Account<'info, Mint>,
    #[account(init, payer = admin, token::mint = usdc_mint, token::authority = protocol, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LpDeposit<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"busdc_mint"], bump)]
    pub busdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_busdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct LpWithdraw<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"busdc_mint"], bump)]
    pub busdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_busdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub withdrawer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializePosition<'info> {
    #[account(init, payer = owner, space = 8 + Position::INIT_SPACE, seeds = [b"position", owner.key().as_ref()], bump)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfigureGad<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: PDA vault
    #[account(mut, seeds = [b"vault", position.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimYield<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    /// CHECK: PDA vault
    #[account(mut, seeds = [b"vault", position.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BorrowUsdc<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepayUsdc<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: PDA vault
    #[account(mut, seeds = [b"vault", position.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlashLoan<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    pub borrower: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepayFlashLoan<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    pub borrower: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CrankGad<'info> {
    #[account(mut, seeds = [b"position", position.owner.as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = treasury)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: PDA vault
    #[account(mut, seeds = [b"vault", position.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,
    /// CHECK: Treasury
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub cranker: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LeverageLong<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: PDA vault for collateral
    #[account(mut, seeds = [b"vault", position.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LeverageDepositLoop<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: PDA vault for collateral
    #[account(mut, seeds = [b"vault", position.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deleverage<'info> {
    #[account(mut, seeds = [b"position", owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, Protocol>,
    /// CHECK: PDA vault for collateral
    #[account(mut, seeds = [b"vault", position.key().as_ref()], bump)]
    pub collateral_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"usdc_vault"], bump)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ========== SHORT POSITION ACCOUNTS ==========

#[derive(Accounts)]
pub struct InitializeShortVault<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(init, payer = admin, token::mint = usdc_mint, token::authority = protocol, seeds = [b"short_collateral_vault"], bump)]
    pub short_collateral_vault: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeShortPosition<'info> {
    #[account(init, payer = owner, space = 8 + ShortPosition::INIT_SPACE, seeds = [b"short_position", owner.key().as_ref()], bump)]
    pub short_position: Account<'info, ShortPosition>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LeverageShort<'info> {
    #[account(mut, seeds = [b"short_position", owner.key().as_ref()], bump = short_position.bump, has_one = owner)]
    pub short_position: Account<'info, ShortPosition>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = treasury)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"short_collateral_vault"], bump)]
    pub short_collateral_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    /// CHECK: Treasury for SOL transfers
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseShort<'info> {
    #[account(mut, seeds = [b"short_position", owner.key().as_ref()], bump = short_position.bump, has_one = owner)]
    pub short_position: Account<'info, ShortPosition>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = treasury)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"short_collateral_vault"], bump)]
    pub short_collateral_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,
    /// CHECK: Treasury for SOL transfers
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ========== DATA ==========

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub admin: Pubkey,
    pub sol_price_usd_6dec: u64,
    pub last_price_update: i64,
    pub total_collateral: u64,
    pub total_borrowed: u64,
    pub treasury: Pubkey,
    pub usdc_mint: Pubkey,
    pub busdc_mint: Pubkey,
    pub total_lp_deposits: u64,
    pub total_lp_shares: u64,
    pub insurance_fund: u64,
    pub total_interest_earned: u64,
    // Short position tracking
    pub total_short_collateral_usdc: u64,
    pub total_short_borrowed_sol: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub collateral_amount: u64,        // SOL deposited (in lamports)
    pub staked_amount: u64,            // JitoSOL equivalent (staked portion)
    pub last_stake_update: i64,        // Last time staking yield was calculated
    pub accumulated_yield: u64,        // Accumulated staking yield (in lamports)
    pub borrowed_amount: u64,
    pub last_update: i64,
    pub last_gad_crank: i64,
    pub gad_config: GadConfig,
    pub total_gad_liquidated: u64,
    pub reputation: Reputation,
    pub bump: u8,
}

/// Short position: USDC collateral, borrow SOL
/// Used for shorting SOL (betting price will go down)
#[account]
#[derive(InitSpace)]
pub struct ShortPosition {
    pub owner: Pubkey,
    pub usdc_collateral: u64,      // USDC deposited as collateral (6 decimals)
    pub sol_borrowed: u64,          // SOL borrowed (9 decimals, in lamports)
    pub entry_price: u64,           // SOL price when position opened (6 decimals)
    pub last_update: i64,
    pub gad_config: GadConfig,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct GadConfig {
    pub enabled: bool,
    pub custom_start_ltv_bps: u64,
    pub min_collateral_floor: u64,
}

impl Default for GadConfig {
    fn default() -> Self {
        Self { enabled: true, custom_start_ltv_bps: GAD_START_LTV_BPS, min_collateral_floor: 0 }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct Reputation {
    pub successful_repayments: u32,
    pub total_repaid: u64,
    pub gad_events: u32,
    pub account_created: i64,
}

impl Reputation {
    pub fn get_score(&self) -> u32 {
        let base = std::cmp::min(self.successful_repayments * 50, 500);
        base.saturating_sub(self.gad_events * 100)
    }
    
    pub fn get_ltv_bonus_bps(&self) -> u64 {
        match self.get_score() {
            s if s >= 400 => 1500,
            s if s >= 200 => 1000,
            s if s >= 100 => 500,
            _ => 0,
        }
    }
}

// ========== EVENTS ==========

#[event]
pub struct GadExecuted {
    pub position: Pubkey,
    pub collateral_liquidated: u64,
    pub debt_reduced: u64,
    pub ltv_bps: u64,
    pub gad_rate_bps: u64,
    pub cranker: Pubkey,
    pub crank_reward: u64,
}

#[event]
pub struct LpDepositEvent {
    pub depositor: Pubkey,
    pub usdc_amount: u64,
    pub shares_minted: u64,
}

#[event]
pub struct LpWithdrawEvent {
    pub withdrawer: Pubkey,
    pub shares_burned: u64,
    pub usdc_received: u64,
}

#[event]
pub struct FlashLoanInitiated {
    pub borrower: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct FlashLoanRepaid {
    pub borrower: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct LeverageLongEvent {
    pub position: Pubkey,
    pub initial_deposit: u64,
    pub total_collateral: u64,
    pub borrowed_usdc: u64,
    pub total_debt: u64,
    pub achieved_leverage_x10: u64,
    pub target_leverage_x10: u64,
}

#[event]
pub struct LeverageLoopEvent {
    pub position: Pubkey,
    pub sol_deposited: u64,
    pub usdc_borrowed: u64,
    pub total_collateral: u64,
    pub total_debt: u64,
}

#[event]
pub struct DeleverageEvent {
    pub position: Pubkey,
    pub usdc_repaid: u64,
    pub sol_withdrawn: u64,
    pub remaining_collateral: u64,
    pub remaining_debt: u64,
}

#[event]
pub struct LeverageShortEvent {
    pub position: Pubkey,
    pub usdc_deposited: u64,
    pub sol_borrowed: u64,
    pub total_collateral: u64,
    pub total_debt_sol: u64,
    pub entry_price: u64,
    pub target_leverage_x10: u64,
}

#[event]
pub struct CloseShortEvent {
    pub position: Pubkey,
    pub sol_repaid: u64,
    pub usdc_returned: u64,
    pub remaining_collateral: u64,
    pub remaining_debt: u64,
}

#[event]
pub struct StakeEvent {
    pub position: Pubkey,
    pub amount_staked: u64,
    pub total_staked: u64,
    pub accumulated_yield: u64,
}

#[event]
pub struct YieldClaimedEvent {
    pub position: Pubkey,
    pub amount_claimed: u64,
    pub remaining_staked: u64,
}

// ========== ERRORS ==========

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Exceeds maximum LTV")]
    ExceedsLTV,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("GAD disabled")]
    GadDisabled,
    #[msg("No debt to deleverage")]
    NoDebtToDeleverage,
    #[msg("No collateral")]
    NoCollateral,
    #[msg("LTV below GAD threshold")]
    LtvBelowGadThreshold,
    #[msg("Crank too soon")]
    CrankTooSoon,
    #[msg("Nothing to liquidate")]
    NothingToLiquidate,
    #[msg("Below collateral floor")]
    BelowCollateralFloor,
    #[msg("Invalid GAD config")]
    InvalidGadConfig,
    #[msg("No LP shares")]
    NoLpShares,
    #[msg("Invalid leverage multiplier (must be 2x-5x)")]
    InvalidLeverage,
    #[msg("Staking is currently disabled")]
    StakingDisabled,
    #[msg("No yield available to claim")]
    NoYieldToClaim,
}
