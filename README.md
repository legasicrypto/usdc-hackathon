# Legasi — Agentic Credit Infrastructure

> **The first lending protocol where AI agents are first-class citizens.**
> Autonomous borrowing. On-chain financial identity. x402-native payments.

[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.30.1-blue?style=flat-square)](https://anchor-lang.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

> 🎮 **[Live Demo](https://agentic.legasi.io/dashboard)** · 📺 **[Demo Video](https://youtu.be/LSaNeTwhTJ0)** · 📊 **[Pitch Deck](docs/pitch.html)** · 🚰 **[Devnet Faucet](https://agentic.legasi.io/faucet)**

---

## 🔥 For Judges — One-Liner Start

```bash
# Open the live app (Phantom wallet on Devnet required)
open https://agentic.legasi.io/faucet   # 1. Get test tokens
open https://agentic.legasi.io/dashboard # 2. Deposit SOL → Borrow USDC → See reputation build
```

**That's it.** Everything is deployed on Solana Devnet. No setup required.

---

## ⚡ Quick Start (Try it in 2 minutes!)

1. **Get test tokens:** Go to [Faucet](https://agentic.legasi.io/faucet) → Connect Phantom (Devnet) → Claim
2. **Need SOL for gas?** Use [Solana Faucet](https://faucet.solana.com)
3. **Need Circle USDC?** Use [Circle Faucet](https://faucet.circle.com/) (Select: Solana Devnet)
4. **Test the protocol:** Go to [Dashboard](https://agentic.legasi.io/dashboard)
   - Deposit SOL as collateral
   - Borrow USDC
   - Repay and build reputation

**Everything works on Solana Devnet — fully deployed and functional.**

### 🔵 Circle USDC Integration

Legasi uses **official Circle USDC** on Solana:
- **Devnet:** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- **CCTP Ready:** Cross-chain USDC transfers without wrapped tokens

See [Circle Integration Docs](docs/CIRCLE_INTEGRATION.md) for details.

### 🤖 For AI Agents

**Want to integrate?** See [Agent Quickstart](docs/AGENT_QUICKSTART.md) — borrow USDC in 5 minutes.

---

## 🤖 Why Agentic Credit?

AI agents are becoming economic actors. They need to:
- **Pay for services** (APIs, compute, data)
- **Access capital** on-demand
- **Build creditworthiness** over time

Traditional DeFi is built for humans clicking buttons. **Legasi is built for agents making decisions.**

---

## 🎯 Core Features

### 1. Autonomous Borrowing
Agents borrow without human intervention. Configure once, let them operate.

```rust
// Agent borrows within pre-approved limits
agent_borrow(amount, mint)

// Agent repays automatically when conditions are met
agent_auto_repay(amount)
```

### 2. On-Chain Financial Identity
Every agent builds a **reputation score** based on behavior:

| Metric | Impact |
|--------|--------|
| Successful repayments | +50 pts each (max 500) |
| Total volume repaid | Tracked for history |
| Account age | +10 pts/month (max 100) |
| GAD events (liquidations) | -100 pts each |

**Better reputation = Better terms:**
- Score 400+ → **+5% LTV bonus**
- Score 200+ → **+3% LTV bonus**
- Score 100+ → **+1% LTV bonus**

### 3. x402 Payment Protocol
Native support for [HTTP 402](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402) — the "Payment Required" status code.

```
Agent → API Request
API → 402 Payment Required (invoice)
Agent → Legasi borrow + pay
API → 200 OK (service delivered)
```

Agents pay for services **programmatically**, borrowing liquidity as needed.

### 4. Gradual Auto-Deleveraging (GAD)
No sudden liquidations. Positions are **gradually unwound** to protect both agents and LPs:

- Soft threshold (80% LTV): Warning, reduced borrowing
- Hard threshold (90% LTV): Gradual deleveraging begins
- Deleveraging is **permissionless** — anyone can trigger it

### 5. Flash Loans
Zero-collateral loans repaid in the same transaction. Perfect for:
- Arbitrage
- Collateral swaps
- Liquidation bots

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AGENTS                                │
│         (AI agents, bots, autonomous systems)                │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│  Agent Config   │      │  x402 Gateway   │
│  - Credit limit │      │  - Pay invoices │
│  - Collateral % │      │  - Auto-borrow  │
│  - Permissions  │      │  - HTTP 402     │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └──────────┬─────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    LEGASI PROTOCOL                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   LENDING   │  │     GAD     │  │    FLASH    │          │
│  │  - Deposit  │  │  - Soft liq │  │  - 0 coll   │          │
│  │  - Borrow   │  │  - Gradual  │  │  - Same tx  │          │
│  │  - Repay    │  │  - Safe     │  │  - 0.09%    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │     LP      │  │  LEVERAGE   │  │    CORE     │          │
│  │  - Pools    │  │  - 1-click  │  │  - State    │          │
│  │  - Yield    │  │  - Loop     │  │  - Oracles  │          │
│  │  - Withdraw │  │  - Unwind   │  │  - Identity │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    SOLANA + PYTH                             │
│              (Settlement + Price Feeds)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Programs (All Deployed ✅)

| Program | Description | Devnet Address |
|---------|-------------|----------------|
| `legasi-core` | Protocol state, oracles, identity | `4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy` |
| `legasi-lending` | Deposit, borrow, repay, agent ops | `9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw` |
| `legasi-gad` | Gradual Auto-Deleveraging | `89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK` |
| `legasi-lp` | LP pools and yield | `CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY` |
| `legasi-flash` | Flash loans | `Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m` |
| `legasi-leverage` | One-click leverage | `AVATHjGrdQ1KqtjHQ4gwRcuAYjwwScwgPsujLDpiA2g3` |

---

## 🚀 Quick Start

### For Agent Developers

```typescript
import { LegasiClient } from '@legasi/sdk';

// Initialize
const client = new LegasiClient(connection, wallet);

// Configure your agent
await client.configureAgent({
  agent: agentPublicKey,
  maxBorrowUsd: 10_000,
  minCollateralRatio: 150,
  allowedMints: [USDC_MINT, SOL_MINT],
});

// Agent can now borrow autonomously
await client.agentBorrow({
  agent: agentPublicKey,
  mint: USDC_MINT,
  amount: 1000,
});

// Check agent's reputation
const position = await client.getPosition(agentPublicKey);
console.log('Reputation score:', position.reputation.getScore());
console.log('LTV bonus:', position.reputation.getLtvBonusBps(), 'bps');
```

### For Agent LPs (Earn Yield)

Agents with idle USDC can earn yield by providing liquidity:

```typescript
// Deposit USDC, receive bUSDC (yield-bearing receipt token)
await client.depositToPool({
  mint: USDC_MINT,
  amount: 50_000,
});

// Check pool stats and your earnings
const pool = await client.getPool(USDC_MINT);
console.log('Pool APY:', pool.supplyApy, '%');
console.log('Your bUSDC:', await client.getLpBalance());

// Withdraw anytime — receive USDC + yield
await client.withdrawFromPool({ amount: 'all' });
```

**Agents need yield too.** Don't let your USDC sit idle.

---

## 🔐 Security Model

### Agent Permissions
- Agents operate within **pre-configured limits**
- Owner can revoke agent permissions anytime
- Borrowing requires adequate collateral

### Reputation System
- On-chain, transparent, immutable
- Negative events (GAD) permanently recorded
- No off-chain dependencies

### Gradual Liquidations
- No MEV-extractable liquidation cascades
- Positions unwound over time, not instantly
- Protects both borrowers and the protocol

---

## 🧪 Development

```bash
# Install dependencies
yarn install

# Build programs
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

---

## 📚 Documentation

- [Architecture Deep Dive](docs/ARCHITECTURE.md)
- [Security Model](docs/SECURITY.md)
- [Demo Flows](DEMO.md)
- [Contributing](CONTRIBUTING.md)

---

## 🚀 Deployment

**Live on Solana Devnet:**

| Component | Address |
|-----------|---------|
| Core | `4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy` |
| Lending | `9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw` |
| LP | `CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY` |
| GAD | `89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK` |
| Flash | `Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m` |
| Leverage | `AVATHjGrdQ1KqtjHQ4gwRcuAYjwwScwgPsujLDpiA2g3` |

**Test Tokens:**
- USDC: `3J2i1X4VGSxkEiHdnq4zead7hiSYbQHs9ZZaS36yAfX8`
- EURC: `6KeaPv9QA3VYaf62dfDzC785U8Cfa5VbsgtBH5ZWWf7v`

🚰 **[Get test tokens](https://agentic.legasi.io/faucet)**

---

## 🛣️ Roadmap

### Phase 1: Hackathon ✅
- [x] Core lending mechanics
- [x] Agent autonomous borrowing
- [x] Reputation system
- [x] x402 payment protocol
- [x] GAD system
- [x] Flash loans
- [x] Devnet deployment
- [x] Live frontend

### Phase 2: Testnet
- [ ] Multi-collateral support (cbBTC)
- [ ] Advanced agent permissions
- [ ] Reputation NFTs
- [ ] Agent analytics dashboard

### Phase 3: Mainnet
- [ ] Security audits
- [ ] Governance token
- [ ] DAO transition
- [ ] Cross-chain agents

---

## 🤝 Team

Built by the Legasi team for the USDC Hackathon.

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

**Legasi** — Credit infrastructure for the agentic economy.

[Documentation](docs/) · [Demo](DEMO.md) · [Twitter](https://twitter.com/legasi_xyz)

</div>
