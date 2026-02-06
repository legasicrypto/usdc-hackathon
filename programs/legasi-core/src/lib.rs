use anchor_lang::prelude::*;

declare_id!("4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy");

pub mod constants;
pub mod errors;
pub mod events;
pub mod interest;
pub mod pyth;
pub mod state;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use interest::*;
pub use pyth::*;
pub use state::*;

#[program]
pub mod legasi_core {
    use super::*;

    /// Initialize the protocol state
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, treasury: Pubkey) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol;
        protocol.admin = ctx.accounts.admin.key();
        protocol.treasury = treasury;
        protocol.insurance_fund = 0;
        protocol.total_collateral_usd = 0;
        protocol.total_borrowed_usd = 0;
        protocol.paused = false;
        protocol.bump = ctx.bumps.protocol;

        msg!("Protocol initialized with admin: {}", protocol.admin);
        Ok(())
    }

    /// Register a collateral asset (SOL, cbBTC)
    pub fn register_collateral(
        ctx: Context<RegisterCollateral>,
        oracle: Pubkey,
        max_ltv_bps: u16,
        liquidation_threshold_bps: u16,
        liquidation_bonus_bps: u16,
        decimals: u8,
        asset_type: AssetType,
    ) -> Result<()> {
        let collateral = &mut ctx.accounts.collateral;
        collateral.mint = ctx.accounts.mint.key();
        collateral.oracle = oracle;
        collateral.max_ltv_bps = max_ltv_bps;
        collateral.liquidation_threshold_bps = liquidation_threshold_bps;
        collateral.liquidation_bonus_bps = liquidation_bonus_bps;
        collateral.decimals = decimals;
        collateral.is_active = true;
        collateral.total_deposited = 0;
        collateral.asset_type = asset_type;
        collateral.bump = ctx.bumps.collateral;

        msg!("Collateral registered: {:?}", asset_type);
        Ok(())
    }

    /// Register a borrowable asset (USDC, USDT, EURC)
    pub fn register_borrowable(
        ctx: Context<RegisterBorrowable>,
        oracle: Pubkey,
        interest_rate_bps: u16,
        decimals: u8,
        asset_type: AssetType,
    ) -> Result<()> {
        let borrowable = &mut ctx.accounts.borrowable;
        borrowable.mint = ctx.accounts.mint.key();
        borrowable.oracle = oracle;
        borrowable.interest_rate_bps = interest_rate_bps;
        borrowable.decimals = decimals;
        borrowable.is_active = true;
        borrowable.total_borrowed = 0;
        borrowable.total_available = 0;
        borrowable.asset_type = asset_type;
        borrowable.bump = ctx.bumps.borrowable;

        msg!("Borrowable registered: {:?}", asset_type);
        Ok(())
    }

    /// Initialize a price feed for a token (keyed by mint)
    pub fn initialize_price_feed(
        ctx: Context<InitializePriceFeed>,
        asset_type: AssetType,
        initial_price_usd: u64,
    ) -> Result<()> {
        let price_feed = &mut ctx.accounts.price_feed;
        price_feed.asset_type = asset_type;
        price_feed.price_usd_6dec = initial_price_usd;
        price_feed.last_update = Clock::get()?.unix_timestamp;
        price_feed.confidence = 0;
        price_feed.bump = ctx.bumps.price_feed;

        msg!(
            "Price feed initialized: {:?} = ${}",
            asset_type,
            initial_price_usd as f64 / 1_000_000.0
        );
        Ok(())
    }

    /// Update price (admin only - for testing/fallback)
    pub fn update_price(ctx: Context<UpdatePrice>, price_usd: u64) -> Result<()> {
        let price_feed = &mut ctx.accounts.price_feed;
        price_feed.price_usd_6dec = price_usd;
        price_feed.last_update = Clock::get()?.unix_timestamp;

        msg!("Price updated to ${}", price_usd as f64 / 1_000_000.0);
        Ok(())
    }

    /// Sync price from Pyth oracle (permissionless)
    pub fn sync_pyth_price(ctx: Context<SyncPythPrice>) -> Result<()> {
        let pyth_data = ctx.accounts.pyth_price_account.try_borrow_data()?;

        let pyth_price = parse_pyth_price(&pyth_data).ok_or(LegasiError::InvalidOracle)?;

        let now = Clock::get()?.unix_timestamp;

        // Check price is not stale
        require!(
            !pyth_price.is_stale(now, MAX_PRICE_AGE),
            LegasiError::StalePriceFeed
        );

        // Check confidence is acceptable
        require!(
            pyth_price.confidence_bps() <= MAX_CONFIDENCE_BPS,
            LegasiError::InvalidOracle
        );

        // Update our price feed
        let price_feed = &mut ctx.accounts.price_feed;
        price_feed.price_usd_6dec = pyth_price.to_usd_6dec();
        price_feed.confidence = pyth_price.conf;
        price_feed.last_update = now;

        msg!(
            "Synced Pyth price: ${}",
            price_feed.price_usd_6dec as f64 / 1_000_000.0
        );
        Ok(())
    }

    /// Pause/unpause protocol (admin only)
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.protocol.paused = paused;
        msg!("Protocol paused: {}", paused);
        Ok(())
    }
}

// ========== ACCOUNTS ==========

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
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterCollateral<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        init,
        payer = admin,
        space = 8 + Collateral::INIT_SPACE,
        seeds = [b"collateral", mint.key().as_ref()],
        bump
    )]
    pub collateral: Account<'info, Collateral>,
    /// CHECK: Token mint
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterBorrowable<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        init,
        payer = admin,
        space = 8 + Borrowable::INIT_SPACE,
        seeds = [b"borrowable", mint.key().as_ref()],
        bump
    )]
    pub borrowable: Account<'info, Borrowable>,
    /// CHECK: Token mint
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePriceFeed<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        init,
        payer = admin,
        space = 8 + PriceFeed::INIT_SPACE,
        seeds = [b"price", mint.key().as_ref()],
        bump
    )]
    pub price_feed: Account<'info, PriceFeed>,
    /// CHECK: Token mint for this price feed
    pub mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    #[account(
        mut,
        seeds = [b"price", mint.key().as_ref()],
        bump = price_feed.bump
    )]
    pub price_feed: Account<'info, PriceFeed>,
    /// CHECK: Token mint
    pub mint: UncheckedAccount<'info>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = admin)]
    pub protocol: Account<'info, Protocol>,
    pub admin: Signer<'info>,
}

/// Sync price from Pyth oracle (permissionless - anyone can update)
#[derive(Accounts)]
pub struct SyncPythPrice<'info> {
    #[account(
        mut,
        seeds = [b"price", mint.key().as_ref()],
        bump = price_feed.bump
    )]
    pub price_feed: Account<'info, PriceFeed>,
    /// CHECK: Token mint for this price feed
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Pyth price account - verified by parsing
    pub pyth_price_account: UncheckedAccount<'info>,
}
