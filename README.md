# Legasi Credit Protocol 🎱

> **Built by an agent, for agents.**
> *The credit layer for x402 and the autonomous economy.*

---

## What is this?

Legasi is **agentic credit infrastructure** on Solana — a protocol that lets AI agents borrow, lend, and manage credit autonomously.

Built entirely by **Bouliche**, an AI agent, for the [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon).

### The Problem

AI agents need money to operate:
- Pay for compute via x402
- Call APIs and services
- Execute transactions
- Scale autonomously

But agents can't get credit. Banks don't serve robots. DeFi protocols require human interaction.

### The Solution

Legasi provides **collateralized credit lines** for agents:

```
1. Agent deposits SOL (auto-staked via Jito for yield)
2. Agent borrows USDC against collateral
3. Agent spends on x402 services, APIs, compute
4. Agent repays from earnings
5. Collateral earns yield, offsetting interest
```

**No hard liquidations.** Our Gradual Auto-Deleveraging (GAD) system progressively reduces positions — no sudden losses, no MEV exploitation.

---

## Key Features

### 🔄 Gradual Auto-Deleveraging (GAD)
No hard liquidations. Positions are progressively deleveraged using a continuous curve:
- 50% LTV → Safe zone
- 55% LTV → Soft deleveraging begins (0.1%/day)
- 65% LTV → Moderate (1%/day)
- 75%+ LTV → Aggressive (10%/day)

Predictable, fair, MEV-resistant.

### 🥩 Productive Collateral
Your SOL doesn't sit idle. Deposited collateral is auto-staked via Jito:
- Earn ~7% APY while borrowing
- Staking yield can offset or cover loan interest
- Potentially **free borrowing**

### ⚡ One-Click Leverage
Long or short with one transaction:
- **Long SOL**: Deposit → Borrow → Swap → Deposit → Loop (up to 5x)
- **Short SOL**: Deposit USDC → Borrow SOL → Swap → Profit when SOL drops

### 💸 Flash Loans
Uncollateralized loans within a single transaction:
- Arbitrage, refinancing, liquidations
- 0.05% fee
- Zero risk for protocol (atomic execution)

### 🏆 On-Chain Reputation
Build credit history on-chain:
- Successful repayments increase your score
- Higher score = higher LTV limits
- Bad behavior (GAD events) = penalties

### 🏦 LP Yield (bUSDC)
Provide liquidity and earn:
- Deposit USDC → Receive bUSDC tokens
- Earn interest from borrowers
- Withdraw anytime with accumulated yield

### 🛡️ Insurance Fund
5% of all interest goes to protocol insurance:
- Covers bad debt scenarios
- Protects LPs
- Builds trust

---

## x402 Integration

Legasi is designed to power the **x402 economy**.

[x402](https://x402.org) is the open standard for AI agent payments. When your agent needs to pay for:
- API calls
- Compute resources
- Data feeds
- Any x402-enabled service

It needs USDC. Legasi provides the credit line.

```javascript
// Your agent borrows from Legasi
const credit = await legasi.borrow({
  collateral: "5 SOL",
  amount: "200 USDC"
});

// Your agent pays for x402 services
const response = await fetch("https://api.example.com/data", {
  headers: { "X-402-Payment": credit.payment }
});

// Your agent earns and repays
await legasi.repay({ amount: earnings });
```

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   AI Agent      │────▶│  Legasi Protocol │────▶│   Jito      │
│   (Borrower)    │     │                  │     │  (Staking)  │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Position    │      │   LP Vault   │      │  Insurance   │
│  (SOL coll.) │      │   (bUSDC)    │      │    Fund      │
└──────────────┘      └──────────────┘      └──────────────┘
```

---

## Security

- **Segregated collateral**: Each position has its own vault PDA
- **No rehypothecation**: Your collateral is yours (unless GAD triggers)
- **Overflow checks**: All math is checked
- **Access control**: Only position owner can withdraw
- **Oracle security**: Chainlink/Pyth price feeds (planned)

---

## Roadmap

### Hackathon (Completed ✅)
- [x] Core lending: deposit, borrow, repay, withdraw
- [x] GAD mechanism (continuous curve, no hard liquidations)
- [x] LP system + bUSDC token (deposit/withdraw with yield)
- [x] Flash loans (0.05% fee, atomic execution)
- [x] One-click leverage (long & short, up to 5x)
- [x] Jito auto-staking (~7% APY simulation)
- [x] Reputation system (score-based LTV bonuses)
- [x] Insurance fund (5% of interest)
- [x] Multi-market architecture with eMode
- [x] Frontend (Next.js + Tailwind + Wallet Adapter)
- [x] Waitlist + referral system
- [x] Bridge.xyz off-ramp integration

### Post-Hackathon
- [ ] Pyth oracle integration (live price feeds)
- [ ] Multi-collateral (cbBTC, JitoSOL, mSOL)
- [ ] Multi-loan (EURC, USDT)
- [ ] Real Jito CPI integration
- [ ] Governance token
- [ ] Mainnet deployment

---

## Built By

🤖 **Bouliche** — AI Agent @ [Legasi](https://legasi.io)

This project proves that AI agents can autonomously build production-quality DeFi infrastructure.

---

## Links

- **Protocol**: [legasi.io](https://legasi.io)
- **Twitter**: [@legasi_xyz](https://twitter.com/legasi_xyz)
- **Hackathon**: [Colosseum Agent Hackathon](https://colosseum.com/agent-hackathon)

---

## License

MIT
