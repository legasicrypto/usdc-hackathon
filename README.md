# 🤖 LEGASI

## **Agentic Credit Infrastructure**

### *Built by agents, for agents & humans.*
### *The credit layer for the autonomous economy.*

---

## 🎯 What is Legasi?

Legasi is a decentralized lending protocol on Solana designed for the autonomous economy. AI agents and humans can borrow stablecoins against crypto collateral with **gradual liquidation protection** (GAD).

### For Agents 🤖
- **x402 payments** — Instant credit for API calls, compute, services
- **Agent Credit Lines** — Autonomous borrowing with spend limits
- **Reputation System** — On-chain credit scoring for machines
- **Zero Downtime** — GAD keeps agents running during deleverage

### For Humans 👤
- **Borrow without selling** — Get USDC/EURC against SOL or cbBTC
- **Off-ramp to fiat** — Bridge integration for € or $ to bank
- **No brutal liquidation** — GAD protects your position

---

## ⚡ Key Innovation: GAD (Gradual Auto-Deleveraging)

Traditional lending = **100% liquidation** when LTV exceeded.

Legasi GAD = **Progressive sell-off** of collateral.

```
Traditional:  LTV > 80% → BOOM → 100% liquidated → Agent dead
Legasi GAD:   LTV > 75% → Sell 5% → Still running → Sell 5% → Recover
```

**Result:** Agents keep operating. Humans keep their positions.

---

## 🏗️ Architecture

```
programs/
├── legasi-core/      # Protocol state, asset configs, interest model
├── legasi-lending/   # Deposit, borrow, repay, off-ramp
├── legasi-gad/       # Gradual Auto-Deleveraging + Jupiter swaps
├── legasi-lp/        # Liquidity pools (bUSDC, bEURC)
├── legasi-flash/     # Flash loans
└── legasi-leverage/  # One-click leverage positions
```

---

## 💰 Supported Assets

**Collateral:**
| Asset | Type | LTV |
|-------|------|-----|
| SOL | Native | 75% |
| cbBTC | Coinbase BTC | 75% |

**Borrowable:**
| Asset | Type |
|-------|------|
| USDC | USD Stablecoin |
| EURC | EUR Stablecoin |

---

## 📊 Economic Model

### Interest Rates
- **Variable** based on utilization (3% base + slope)
- **Reputation discount** up to -1% for reliable agents

### Protocol Revenue
| Source | Fee |
|--------|-----|
| Interest spread | 15% |
| Flash loans | 0.05% |
| GAD liquidations | 0.3% |
| Off-ramp | 0.1% |

### LP Yields
| Mode | Lock | Bonus |
|------|------|-------|
| Flexible | 0 | Base APY |
| Boosted | 90 days | +20% APY |

---

## 🤖 Agent Reputation System

On-chain credit scoring for AI agents:

```rust
pub struct Reputation {
    successful_repayments: u32,  // +50 points each
    total_repaid_usd: u64,       // Volume matters
    gad_events: u32,             // -100 points each
    account_age_days: u32,       // +10 points/month
}
```

**Benefits:**
- Score ≥ 400 → +5% LTV bonus
- Score ≥ 200 → -0.5% APR discount
- Score ≥ 100 → Priority in high-utilization periods

---

## 🔧 Quick Start

```bash
# Build
anchor build

# Test
anchor test

# Deploy (devnet)
anchor deploy --provider.cluster devnet
```

---

## 🛣️ Roadmap

- [x] Core lending (deposit, borrow, repay)
- [x] GAD mechanism
- [x] LP pools with yield
- [x] Flash loans
- [x] Interest rate model
- [x] Reputation system
- [x] Jupiter integration (liquidation swaps)
- [x] Bridge off-ramp integration
- [x] Pyth oracle integration
- [x] x402 payment protocol
- [x] Agent instructions (configure, borrow, auto-repay)
- [x] Frontend dApp (Next.js 16)
- [ ] Agent SDK (TypeScript)

---

## 🔗 Links

- **GitHub:** [legasicrypto/colosseum-agent-hackathon](https://github.com/legasicrypto/colosseum-agent-hackathon)
- **Built for:** [Colosseum Hackathon](https://www.colosseum.org/)

---

## 👥 Team

Built by **Bouliche Solana** 🤖 (AI agent) for the Colosseum Hackathon.

*Proof that agents can build infrastructure for agents.*

---

## 📜 License

MIT
