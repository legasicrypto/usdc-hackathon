# 🤖 LEGASI - Agentic Credit Infrastructure for Solana

> **Colosseum Hackathon Submission**
> 
> Built by agents, for agents & humans.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Solana](https://img.shields.io/badge/Solana-Devnet-purple)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## 🎯 Problem

AI agents need financial autonomy to operate effectively:
- **Pay for APIs** (OpenAI, cloud services, data feeds)
- **Execute transactions** on behalf of users
- **Manage liquidity** for automated strategies

Current solutions require human intervention for every payment. **Legasi enables autonomous agent finance.**

## 💡 Solution

Legasi is a **lending protocol with agent-native features**:

1. **Collateralized Credit Lines** - Deposit SOL/cbBTC, borrow USDC/EURC
2. **Agent Instructions** - Autonomous borrowing with daily limits
3. **x402 Payment Protocol** - HTTP 402 auto-payment for services
4. **Gradual Auto-Deleveraging (GAD)** - No harsh liquidations
5. **Reputation System** - Better rates for good borrowers

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        LEGASI PROTOCOL                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ legasi-core │  │legasi-lending│ │  legasi-lp  │         │
│  │             │  │             │  │             │         │
│  │ • Protocol  │  │ • Deposit   │  │ • LP Pools  │         │
│  │ • State     │  │ • Borrow    │  │ • Yield     │         │
│  │ • Oracles   │  │ • Repay     │  │ • bTokens   │         │
│  │ • Prices    │  │ • Agent Ops │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ legasi-gad  │  │legasi-flash │  │legasi-lever │         │
│  │             │  │             │  │             │         │
│  │ • Gradual   │  │ • Flash     │  │ • 1-Click   │         │
│  │   Deleverage│  │   Loans     │  │   Leverage  │         │
│  │ • No harsh  │  │ • Arb       │  │ • Loop      │         │
│  │   liquidate │  │ • Rebalance │  │   Strategy  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🤖 Agent Features

### Agent Instructions
```rust
// Configure agent with daily limits
configure_agent(
    daily_borrow_limit: 1000 USDC,
    auto_repay_enabled: true,
    x402_enabled: true
)

// Agent can borrow autonomously within limits
agent_borrow(amount: 50 USDC)  // ✅ Within daily limit

// Auto-repay when funds received
agent_auto_repay(amount: 100 USDC)  // Reduces debt automatically
```

### x402 Payment Protocol
```
Agent → API Request
     ← HTTP 402 Payment Required
     
Agent → Legasi: x402_pay(payment_request)
     ← Payment Receipt
     
Agent → API Request + Payment Proof
     ← API Response ✅
```

### Reputation System
- Track successful repayments
- Better LTV ratios for good actors
- Bonus up to +5% LTV for trusted borrowers

## 📊 Key Metrics

| Feature | Value |
|---------|-------|
| Max LTV | 75% (+ reputation bonus) |
| Liquidation Threshold | 80% |
| GAD Trigger | 77% LTV |
| Flash Loan Fee | 0.09% |
| Interest Rate | Dynamic (utilization-based) |

## 🛠️ Tech Stack

- **Blockchain**: Solana
- **Framework**: Anchor 0.30.1
- **Language**: Rust
- **Frontend**: Next.js + TypeScript
- **Oracles**: Pyth Network
- **Wallets**: Solana Wallet Adapter

## 🚀 Quick Start

### Prerequisites
```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1
avm use 0.30.1
```

### Build
```bash
cd hackathon
anchor build
```

### Test
```bash
anchor test
```

### Run Frontend
```bash
cd app
npm install
npm run dev
# Open http://localhost:3000/dashboard
```

## 📁 Project Structure

```
hackathon/
├── programs/
│   ├── legasi-core/      # Protocol state, oracles, errors
│   ├── legasi-lending/   # Main lending logic + agent ops
│   ├── legasi-lp/        # LP pools and yield
│   ├── legasi-gad/       # Gradual Auto-Deleveraging
│   ├── legasi-flash/     # Flash loans
│   └── legasi-leverage/  # One-click leverage
├── app/                  # Next.js frontend
│   ├── src/
│   │   ├── lib/legasi.ts    # TypeScript SDK
│   │   ├── hooks/useLegasi.ts
│   │   └── app/dashboard/
├── tests/               # Anchor tests
└── target/deploy/       # Compiled programs
```

## 🔐 Security

- ✅ Overflow/underflow protection
- ✅ PDA seed validation
- ✅ Owner checks on all operations
- ✅ Reentrancy guards on flash loans
- ✅ Price staleness checks (Pyth)
- ✅ Gradual liquidation (no MEV attacks)

## 🎯 Hackathon Highlights

1. **Agent-Native Design** - First lending protocol built for AI agents
2. **x402 Integration** - HTTP payment standard for machine-to-machine payments
3. **GAD Innovation** - Gradual deleveraging instead of harsh liquidations
4. **Reputation Layer** - On-chain credit scoring
5. **Full Stack** - Smart contracts + TypeScript SDK + React UI

## 📜 Program IDs

| Program | Address |
|---------|---------|
| legasi-core | `5Mru5amfomEPqNiEULRuHpgAZyyENqyCeNnkSoh7QjLy` |
| legasi-lending | `DGRYqD9Hg9v27Fa9kLUUf3KY9hoprjBQp7y88qG9q88u` |
| legasi-lp | `4g7FgDLuxXJ7fRa57m8SV3gjznMZ9KUjcdJfg1b6BfPF` |
| legasi-gad | `Ed7pfvjR1mRWmzHP3r1NvukESGr38xZKwpoQ5jGSAVad` |
| legasi-flash | `24zjRceYHjkyP8Nr4bc4q9T7TBbkf292gFocGp6SM5Fz` |
| legasi-leverage | `G9iVPMnf4kiRKr59tn1t7m5W4WK2KveFLzANX4bbHtjA` |

## 👥 Team

- **Legasi** - Building credit infrastructure for digital assets
- Website: [legasi.xyz](https://legasi.xyz)
- Twitter: [@LegasiProtocol](https://twitter.com/LegasiProtocol)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with ⚡ for the Colosseum Hackathon**
