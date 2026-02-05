# Legasi Protocol Architecture

> Technical deep-dive into Legasi's modular lending infrastructure for AI agents.

## Overview

Legasi is built as a **modular protocol** with 6 independent programs that compose together:

```
┌─────────────────────────────────────────────────────────────────┐
│                        LEGASI PROTOCOL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ legasi-core  │  │ legasi-lp    │  │ legasi-gad   │          │
│  │              │  │              │  │              │          │
│  │ • Protocol   │  │ • LP Pools   │  │ • Gradual    │          │
│  │   State      │  │ • Deposits   │  │   Auto-      │          │
│  │ • Collateral │  │ • Withdraws  │  │   Delever-   │          │
│  │ • Prices     │  │ • Interest   │  │   aging      │          │
│  │ • Events     │  │              │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────┬────┴────────┬────────┘                   │
│                      │             │                            │
│  ┌──────────────┐    │             │    ┌──────────────┐       │
│  │legasi-lending│◄───┴─────────────┴───►│legasi-flash  │       │
│  │              │                       │              │       │
│  │ • Positions  │                       │ • Flash      │       │
│  │ • Borrow     │                       │   Loans      │       │
│  │ • Repay      │                       │ • Arbitrage  │       │
│  │ • Agent      │                       │              │       │
│  │   Config     │                       │              │       │
│  └──────┬───────┘                       └──────────────┘       │
│         │                                                       │
│         │    ┌──────────────┐                                   │
│         └───►│legasi-lever  │                                   │
│              │              │                                   │
│              │ • One-click  │                                   │
│              │   Leverage   │                                   │
│              │ • Jupiter    │                                   │
│              │   Swaps      │                                   │
│              └──────────────┘                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Programs

### 1. legasi-core

**Purpose:** Central state management and configuration.

**Accounts:**
- `Protocol` - Global protocol state (admin, treasury, pause flag)
- `Collateral` - Per-asset collateral configuration (LTV, liquidation params)
- `PriceFeed` - Price oracle data (Pyth integration ready)

**Instructions:**
- `initialize_protocol` - One-time setup
- `register_collateral` - Add new collateral type
- `update_price` - Update asset price (admin/oracle)
- `pause/unpause` - Emergency controls

### 2. legasi-lending

**Purpose:** Core lending operations and agent management.

**Accounts:**
- `Position` - User's lending position (collateral, debt, reputation)
- `AgentConfig` - Agent-specific settings (limits, permissions)

**Instructions:**
- `initialize_position` - Create new position
- `deposit_sol` / `deposit_spl` - Add collateral
- `borrow` - Take out loan
- `repay` - Repay debt
- `withdraw` - Remove collateral
- `configure_agent` - Set agent permissions

**Agent Features:**
- Daily borrow limits
- Auto-repay configuration
- x402 payment authorization
- Alert thresholds

### 3. legasi-lp

**Purpose:** Liquidity provider pools for borrowable assets.

**Accounts:**
- `LpPool` - Pool state (total deposits, utilization)
- `LpTokenMint` - LP token mint (receipt tokens)
- `Vault` - Asset vault (holds deposited tokens)

**Instructions:**
- `initialize_pool` - Create new LP pool
- `deposit` - Add liquidity, receive LP tokens
- `withdraw` - Burn LP tokens, receive assets
- `accrue_interest` - Update interest accrual

**Interest Model:**
```
Utilization = borrowed / total_deposits
Base Rate = 2%
Slope 1 = 4% (utilization 0-80%)
Slope 2 = 75% (utilization 80-100%)

Interest Rate = base + slope1 * min(util, 0.8) + slope2 * max(0, util - 0.8)
```

### 4. legasi-gad

**Purpose:** Gradual Auto-Deleveraging - MEV-resistant liquidation alternative.

**Accounts:**
- `GadConfig` - Per-position GAD settings

**Instructions:**
- `configure_gad` - Enable/configure GAD protection
- `crank_gad` - Execute gradual deleveraging step

**How GAD Works:**
1. User sets `start_threshold` (e.g., 80% LTV)
2. When LTV exceeds threshold, GAD activates
3. Each step sells `step_size` % of collateral
4. Wait `min_interval` between steps
5. Continue until LTV < threshold

**Benefits:**
- No sudden 100% liquidation
- User keeps remaining collateral
- Time to react and add collateral
- MEV protection (gradual = less profit for bots)

### 5. legasi-flash

**Purpose:** Flash loans for composability.

**Accounts:**
- `FlashLoan` - Temporary loan state (enforces atomic repayment)

**Instructions:**
- `flash_borrow` - Borrow without collateral
- `flash_repay` - Repay within same transaction

**Fee:** 0.09% (9 bps)

**Use Cases:**
- Arbitrage
- Liquidations
- Collateral swaps
- Position migrations

### 6. legasi-leverage

**Purpose:** One-click leveraged positions.

**Instructions:**
- `open_leverage_long` - Leveraged long position
- `open_leverage_short` - Leveraged short position
- `close_leverage` - Unwind position

**Jupiter Integration:**
- Best price routing across all Solana DEXs
- Slippage protection
- Atomic execution

## Security Considerations

### Access Control
- Admin-only functions protected by signer checks
- Position operations require owner signature
- Agent operations require valid AgentConfig

### Overflow Protection
- All arithmetic uses checked operations
- BPS calculations use u64 with explicit bounds
- Price feeds have staleness checks

### Reentrancy
- Flash loans use unique PDA per slot
- State changes before external calls
- CPI guards on all cross-program calls

### Oracle Security
- Pyth price feed integration
- Confidence interval checks
- Staleness validation

## PDA Seeds

```rust
// Protocol (singleton)
["protocol"]

// Collateral config per mint
["collateral", mint.key()]

// Price feed per mint
["price", mint.key()]

// User position
["position", owner.key()]

// Agent config per position
["agent_config", position.key()]

// GAD config per position
["gad_config", position.key()]

// LP pool per mint
["lp_pool", mint.key()]

// LP token mint per pool
["lp_token", mint.key()]

// Vault per pool
["lp_vault", mint.key()]

// Flash loan (ephemeral)
["flash", borrower.key(), slot.to_le_bytes()]
```

## Events

All major operations emit events for indexing:

```rust
// Core
ProtocolInitialized { admin, treasury }
CollateralRegistered { mint, max_ltv_bps }
PriceUpdated { mint, price, timestamp }

// Lending
PositionCreated { owner, position }
Deposited { position, mint, amount }
Borrowed { position, mint, amount }
Repaid { position, mint, amount }
Withdrawn { position, mint, amount }

// GAD
GadConfigured { position, enabled, threshold }
GadExecuted { position, step, amount_sold, debt_repaid }

// LP
PoolCreated { mint, pool }
LpDeposit { pool, depositor, amount, lp_tokens }
LpWithdraw { pool, withdrawer, amount, lp_tokens }

// Flash
FlashBorrowed { borrower, mint, amount }
FlashRepaid { borrower, mint, amount, fee }
```

## Deployment

### Devnet Addresses
```
legasi_core:     4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy
legasi_lending:  (pending)
legasi_lp:       CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY
legasi_gad:      89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK
legasi_flash:    Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m
legasi_leverage: (pending)
```

### Mainnet
Not yet deployed. Audit required.

## Integration Guide

See [INTEGRATION.md](./INTEGRATION.md) for SDK usage and examples.
