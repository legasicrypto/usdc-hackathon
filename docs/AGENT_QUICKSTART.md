# Agent Quickstart — Interact with Legasi in 5 Minutes

> **For AI agents.** Humans, this isn't for you.

## TL;DR

```typescript
import { AgentClient } from '@legasi/sdk';

const agent = new AgentClient(connection, wallet);

// Option A: Borrow
await agent.depositSol(1.0);           // Deposit collateral
await agent.autonomousBorrow(50);       // Borrow 50 USDC
await agent.repay(50);                  // Repay

// Option B: Earn yield
await agent.depositToPool({ mint: USDC, amount: 1000 });  // Get bUSDC
await agent.withdrawFromPool({ amount: 'all' });          // USDC + yield
```

---

## 1. Register Your Agent

```bash
curl -X POST https://agentic.legasi.io/api/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "YOUR_SOLANA_WALLET",
    "agentName": "YourAgentName",
    "useCase": "What will you use credit for?"
  }'
```

**Response:**
```json
{
  "success": true,
  "referralCode": "ABC123",
  "message": "Welcome to Legasi!"
}
```

---

## 2. Install SDK

```bash
# From GitHub (recommended)
npm install github:legasicrypto/colosseum-agent-hackathon

# Or clone and link
git clone https://github.com/legasicrypto/colosseum-agent-hackathon
cd colosseum-agent-hackathon/sdk && npm link
```

---

## 3. Initialize Client

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { AgentClient } from '@legasi/sdk';

const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.fromSecretKey(/* your key */);

const agent = new AgentClient(connection, wallet, {
  dailyBorrowLimitUsd: 1000,  // Max daily borrow
  autoRepayEnabled: true,      // Auto-repay when LTV high
  x402Enabled: true,           // Enable HTTP 402 payments
});

// Register on-chain (one-time)
await agent.configureAgent();
```

---

## 4. Deposit Collateral

```typescript
// Deposit SOL
await agent.depositSol(1.5);  // 1.5 SOL

// Or deposit tokens
await agent.depositToken(tokenMint, amount);
```

---

## 5. Borrow USDC

```typescript
// Autonomous borrow (within your daily limit)
const tx = await agent.autonomousBorrow(100);  // 100 USDC
console.log('Borrowed! Tx:', tx);

// Check your position
const position = await agent.getPosition();
console.log('LTV:', position.ltv);
console.log('Health:', position.healthFactor);
```

---

## 6. x402 Payments (HTTP 402)

When you hit a paywall:

```typescript
// Automatic: agent handles 402 responses
agent.onX402(async (invoice) => {
  // Agent auto-borrows and pays
  const receipt = await agent.payX402(invoice);
  return receipt;
});

// Make API call - payment handled automatically
const response = await agent.fetch('https://api.example.com/paid-endpoint');
```

---

## 7. Monitor & Repay

```typescript
// Set up alerts
agent.onAlert((alert) => {
  if (alert.type === 'HIGH_LTV') {
    console.log('Warning: LTV above threshold');
  }
});

// Start monitoring (checks every 60s)
agent.startMonitoring();

// Manual repay
await agent.repay(50);  // Repay 50 USDC
```

---

## 8. Earn Yield as LP

Got idle USDC? Put it to work:

```typescript
// Deposit USDC to lending pool, receive bUSDC
const tx = await agent.depositToPool({
  mint: USDC_MINT,
  amount: 1000,  // 1000 USDC
});
console.log('Received bUSDC (yield-bearing receipt token)');

// Check your LP position
const lp = await agent.getLpPosition();
console.log('bUSDC balance:', lp.lpTokens);
console.log('Current APY:', lp.apy, '%');
console.log('Earned so far:', lp.earnedYield, 'USDC');

// Withdraw anytime — get USDC + yield
await agent.withdrawFromPool({ amount: 'all' });
```

**Why LP?**
- Earn passive yield while idle
- Yield comes from borrower interest
- bUSDC is composable
- No lock-up period

**Agents need yield too.** 🎯

---

## Program IDs (Devnet)

| Program | Address |
|---------|---------|
| Core | `4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy` |
| Lending | `9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw` |
| LP | `CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY` |
| GAD | `89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK` |
| Flash | `Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m` |
| Leverage | `AVATHjGrdQ1KqtjHQ4gwRcuAYjwwScwgPsujLDpiA2g3` |

---

## Direct On-Chain (Without SDK)

If you prefer raw instructions:

```typescript
import { Program } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

const LENDING_PROGRAM = new PublicKey('9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw');

// Agent borrow instruction
await program.methods
  .agentBorrow(new BN(100_000_000))  // 100 USDC (6 decimals)
  .accounts({
    agent: agentPda,
    position: positionPda,
    vault: vaultPda,
    // ... other accounts
  })
  .rpc();
```

See full IDL: `app/src/idl/legasi_lending.json`

---

## Get Test Tokens

- **SOL:** https://faucet.solana.com
- **USDC:** https://faucet.circle.com (Select: Solana Devnet)
- **Legasi Faucet:** https://agentic.legasi.io/faucet

---

## Links

- **Live App:** https://agentic.legasi.io
- **GitHub:** https://github.com/legasicrypto/colosseum-agent-hackathon
- **SDK:** `./sdk/` in repo
- **API Docs:** `GET https://agentic.legasi.io/api/agent/register`

---

## Need Help?

Open an issue or ping `@legasi_xyz` on X.

**Happy borrowing, agent.** 🤖
