# @legasi/sdk

TypeScript SDK for AI agents to interact with Legasi Protocol on Solana.

## Installation

```bash
npm install @legasi/sdk
# or
yarn add @legasi/sdk
```

## Quick Start

```typescript
import { Connection } from '@solana/web3.js';
import { AgentClient } from '@legasi/sdk';

// Initialize
const connection = new Connection('https://api.devnet.solana.com');
const agent = new AgentClient(connection, wallet, {
  dailyBorrowLimitUsd: 1000,
  autoRepayEnabled: true,
  x402Enabled: true,
});

// Configure agent on-chain
await agent.configureAgent();

// Deposit collateral
await agent.depositSol(1.5);

// Autonomous borrow (within limits)
await agent.autonomousBorrow(100, USDC_MINT);

// Monitor health
agent.onAlert((alert) => {
  console.log(`Alert: ${alert.message}`);
});
agent.startMonitoring();
```

## Clients

### AgentClient

The recommended client for AI agents. Features:
- Autonomous borrowing within daily limits
- Auto-repayment when LTV exceeds threshold
- x402 payment authorization
- Health monitoring with alerts

```typescript
const agent = new AgentClient(connection, wallet, {
  dailyBorrowLimitUsd: 1000,
  autoRepayEnabled: true,
  autoRepayThresholdBps: 8000, // 80%
  x402Enabled: true,
  x402DailyLimitUsd: 100,
  alertThresholdBps: 7500, // 75%
});
```

### LegasiClient

Base client for manual operations:

```typescript
const client = new LegasiClient(connection, wallet);

await client.initializePosition();
await client.depositSol(1);
await client.borrow({ amount: 50, mint: USDC_MINT });
await client.repay({ amount: 50, mint: USDC_MINT });
await client.withdrawSol(1);
```

### GadClient

Gradual Auto-Deleveraging protection:

```typescript
const gad = new GadClient(connection, wallet);

await gad.configure({
  enabled: true,
  startThresholdBps: 8000,
  stepSizeBps: 500,
  minIntervalSeconds: 3600,
});

const status = await gad.getStatus();
```

### FlashLoanClient

Flash loans for arbitrage and liquidations:

```typescript
const flash = new FlashLoanClient(connection, wallet);

await flash.execute({
  amount: 10000,
  mint: USDC_MINT,
  innerInstructions: [
    // Your arbitrage instructions
  ],
});
```

### LeverageClient

One-click leveraged positions:

```typescript
const leverage = new LeverageClient(connection, wallet);

// 3x long SOL
await leverage.openLong({
  collateralAmount: 1,
  leverage: 3,
  direction: 'long',
});

// Close position
await leverage.close();
```

## Utils

```typescript
import {
  calculateLTV,
  calculateHealthFactor,
  calculateLiquidationPrice,
  formatUSD,
  formatSOL,
} from '@legasi/sdk';

const ltv = calculateLTV(collateralValueUsd, debtValueUsd);
const healthFactor = calculateHealthFactor(collateralValueUsd, debtValueUsd);
const liqPrice = calculateLiquidationPrice(collateralAmount, debtValueUsd);
```

## Constants

```typescript
import { PROGRAM_IDS, MINTS, DEFAULTS } from '@legasi/sdk';

console.log(PROGRAM_IDS.CORE); // Core program address
console.log(MINTS.USDC); // USDC mint (devnet)
console.log(DEFAULTS.SOL_MAX_LTV_BPS); // 7500 (75%)
```

## Types

```typescript
import type {
  Position,
  HealthStatus,
  AgentConfigData,
  GadConfigData,
  TxResult,
} from '@legasi/sdk';
```

## Example: Autonomous Trading Agent

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { AgentClient, MINTS } from '@legasi/sdk';

async function runAgent() {
  const connection = new Connection('https://api.devnet.solana.com');
  const keypair = Keypair.fromSecretKey(/* your key */);
  
  const agent = new AgentClient(connection, { publicKey: keypair.publicKey, signTransaction: ... }, {
    dailyBorrowLimitUsd: 500,
    autoRepayEnabled: true,
    x402Enabled: true,
  });

  // Set up monitoring
  agent.onAlert(async (alert) => {
    if (alert.type === 'ltv_warning') {
      console.log('⚠️ LTV Warning:', alert.message);
    }
    if (alert.type === 'auto_repay') {
      console.log('🔄 Auto-repaying:', alert.message);
    }
  });

  agent.startMonitoring(30000); // Check every 30 seconds

  // Trading logic
  const health = await agent.getHealthStatus();
  
  if (health.availableToBorrow > 100) {
    // Borrow and do something productive
    await agent.autonomousBorrow(100, MINTS.USDC);
  }
}
```

## License

MIT
