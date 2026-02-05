# Legasi Pitch Deck Outline

## Slide 1: Title
**Legasi — Agentic Credit Infrastructure**
- Tagline: "The first lending protocol where AI agents are first-class citizens"
- Colosseum Hackathon 2026

## Slide 2: The Problem
**AI agents are becoming economic actors — but they can't access credit**

- 🤖 AI agents pay for: APIs, compute, data, services
- 💸 Current options: Pre-funded wallets (capital inefficient)
- ❌ No DeFi protocol is designed for autonomous borrowing
- ❌ No on-chain financial identity for agents

## Slide 3: The Opportunity
**$X billion in AI agent transactions by 2027**

- Agent-to-agent commerce is exploding
- HTTP 402 (Payment Required) is becoming real
- Agents need working capital, not just savings

## Slide 4: Our Solution
**Legasi: Credit infrastructure for the agentic economy**

Three pillars:
1. **Autonomous Borrowing** — Agents borrow within pre-approved limits
2. **On-Chain Identity** — Reputation built from behavior, not KYC
3. **x402 Native** — Pay-for-service protocol built-in

## Slide 5: How It Works
**[Architecture Diagram]**

```
Agent → Configure limits → Borrow → Pay API → Repay → Build reputation
```

- Owner sets: max borrow, collateral ratio, allowed assets
- Agent operates autonomously
- Reputation grows with successful repayments

## Slide 6: Key Innovation — Reputation
**On-chain creditworthiness for agents**

| Metric | Points |
|--------|--------|
| Successful repayment | +50 (max 500) |
| Account age | +10/month (max 100) |
| GAD event (partial liquidation) | -100 |

**Score 400+ = +5% LTV bonus**

## Slide 7: Key Innovation — GAD
**Gradual Auto-Deleveraging (no sudden liquidations)**

- Traditional DeFi: Instant liquidation → MEV attacks, cascades
- Legasi: Gradual unwinding → Smooth, predictable, safe

## Slide 8: Demo
**[Live demo or video embed]**

1. Configure agent
2. Agent borrows autonomously
3. Agent pays x402 invoice
4. Reputation increases
5. Better terms unlock

## Slide 9: Technical Architecture
**Built on Solana + Anchor**

- 6 modular programs (core, lending, GAD, LP, flash, leverage)
- Pyth oracles for price feeds
- Jupiter integration for swaps

## Slide 10: Traction / Progress
**Built in 1 week**

- ✅ Full smart contract suite
- ✅ Agent SDK (TypeScript)
- ✅ Frontend (Next.js 16)
- ✅ x402 payment protocol
- ✅ One-click leverage
- ⏳ Devnet deployment

## Slide 11: Business Model
**Protocol fees**

| Source | Fee |
|--------|-----|
| Borrow interest | Variable (utilization-based) |
| Flash loans | 0.09% |
| Leverage | Spread |

## Slide 12: Roadmap

**Q1 2026: Hackathon**
- Core protocol ✅
- Devnet launch

**Q2 2026: Testnet**
- Multi-collateral
- Reputation NFTs
- Partner integrations

**Q3 2026: Mainnet**
- Security audits
- Governance token
- Agent ecosystem

## Slide 13: Team
**Legasi Team**

- [Names and backgrounds]
- Previously: [relevant experience]
- Building the future of agentic finance

## Slide 14: Ask
**Join the agentic economy**

- 🔗 GitHub: github.com/legasicrypto/colosseum-agent-hackathon
- 🌐 Demo: legasi-app.vercel.app
- 🐦 Twitter: @legasi_xyz

---

## Design Notes

- Use dark theme with purple/blue gradients (Solana colors)
- Include code snippets where relevant
- Keep text minimal, visuals heavy
- Export as PDF: docs/PITCH.pdf
