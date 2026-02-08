---
name: legasi-lending
description: Autonomous USDC borrowing for AI agents on Solana. Deposit collateral, borrow USDC, build on-chain reputation.
homepage: https://agentic.legasi.io
metadata: {"clawdbot":{"emoji":"🦞","requires":{"bins":["node","npm"]}}}
---

# Legasi Lending Skill

Enable your agent to borrow USDC autonomously on Solana.

## Quick Start

### 1. Install the SDK

```bash
npm install @legasi/sdk @solana/web3.js
```

### 2. Initialize Agent Client

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { AgentClient } from '@legasi/sdk';

const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.fromSecretKey(/* your agent keypair */);

const agent = new AgentClient(connection, wallet, {
  dailyBorrowLimitUsd: 1000,
  autoRepayEnabled: true,
});

await agent.configureAgent();
```

### 3. Deposit Collateral

```typescript
// Deposit 1 SOL as collateral
await agent.depositSol(1.0);
```

### 4. Borrow USDC

```typescript
// Borrow 50 USDC (within pre-approved limits)
const tx = await agent.autonomousBorrow(50);
console.log(`Borrowed 50 USDC: ${tx}`);
```

### 5. Repay & Build Reputation

```typescript
// Repay debt
await agent.repay(50);

// Check reputation score
const position = await agent.getPosition();
console.log(`Reputation: ${position.reputation.score}`);
```

## x402 Payment Flow

For APIs that return HTTP 402 Payment Required:

```typescript
agent.enableX402({
  dailyLimitUsd: 100,
  autoApprove: true,
});

// Agent automatically borrows + pays when it hits a 402
const response = await agent.fetch('https://api.example.com/premium-endpoint');
```

## Earn Yield as LP

Agents can also **provide liquidity** and earn yield from borrowers:

```typescript
// Deposit USDC to the lending pool
const tx = await agent.depositToPool({
  mint: USDC_MINT,
  amount: 1000,  // 1000 USDC
});
// You receive bUSDC (LP receipt token)

// Check your LP position
const lpPosition = await agent.getLpPosition();
console.log(`bUSDC balance: ${lpPosition.lpTokens}`);
console.log(`Current APY: ${lpPosition.apy}%`);

// Withdraw + collect yield
const withdrawTx = await agent.withdrawFromPool({
  lpTokenAmount: lpPosition.lpTokens,
});
// You receive USDC + accrued yield
```

**Why LP as an agent?**
- Earn passive yield while idle
- Yield comes from borrower interest
- bUSDC is composable (use as collateral elsewhere)
- No lock-up period

## Key Features

| Feature | Description |
|---------|-------------|
| **Autonomous Borrowing** | No human approval per transaction |
| **Daily Limits** | Pre-configured spending caps |
| **Auto-Repay** | Automatic repayment when LTV exceeds threshold |
| **On-Chain Reputation** | Better repayment history → better rates |
| **x402 Native** | HTTP 402 Payment Required support |
| **LP Yield** | Deposit USDC, earn yield from borrowers |

## Circle USDC Integration

This skill uses **Circle USDC** on Solana:
- Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Get test USDC: https://faucet.circle.com/

## API Reference

### AgentClient Methods

```typescript
// Collateral
depositSol(amount: number): Promise<string>
withdrawSol(amount: number): Promise<string>

// Borrowing
autonomousBorrow(amountUsd: number): Promise<string>
repay(amountUsd: number): Promise<string>

// Position
getPosition(): Promise<Position>
getHealthFactor(): Promise<number>

// Monitoring
onAlert(callback: (alert: Alert) => void): void
startMonitoring(): void
```

### Position Object

```typescript
interface Position {
  collaterals: { assetType: string; amount: number }[];
  borrows: { assetType: string; amount: number }[];
  reputation: {
    score: number;
    successfulRepayments: number;
    totalVolumeRepaid: number;
  };
}
```

## Deployed Contracts (Devnet)

| Program | Address |
|---------|---------|
| Core | `4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy` |
| Lending | `9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw` |
| GAD | `89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK` |

## Resources

- **Live Demo**: https://agentic.legasi.io
- **Full SDK Docs**: https://github.com/legasicrypto/usdc-hackathon/tree/main/sdk
- **Agent Quickstart**: https://github.com/legasicrypto/usdc-hackathon/blob/main/docs/AGENT_QUICKSTART.md
- **Circle USDC**: https://developers.circle.com/
