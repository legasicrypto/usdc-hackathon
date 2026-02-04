# Legasi Demo Flows

> Demonstrating Agentic Credit Infrastructure in action.

---

## 🤖 Agent Flows

### Flow 1: Configure an AI Agent

An operator sets up their AI agent with borrowing permissions.

```typescript
// Operator configures their agent
await legasi.configureAgent({
  agent: agentPubkey,
  maxBorrowUsd: 10_000,        // Max $10k borrowing
  minCollateralRatio: 150,     // 150% collateralization required
  allowedMints: [USDC, SOL],   // Can borrow USDC and SOL
  autoRepayEnabled: true,      // Allow auto-repay
});
```

**Result:** Agent now has a credit line and can borrow autonomously.

---

### Flow 2: Agent Autonomous Borrowing

Agent needs USDC to pay for an API call. It borrows automatically.

```typescript
// Agent's internal logic
const apiCost = 50; // $50 for API call

// Agent borrows from Legasi
await legasi.agentBorrow({
  agent: agentPubkey,
  mint: USDC_MINT,
  amount: apiCost * 1e6, // 50 USDC
});

// Agent pays for API
await payApi(apiEndpoint, apiCost);

// Later: Agent repays when it has funds
await legasi.agentAutoRepay({
  agent: agentPubkey,
  amount: apiCost * 1e6,
});
```

**Result:** Agent operated autonomously, built reputation with successful repayment.

---

### Flow 3: x402 Payment Protocol

Agent encounters an HTTP 402 response and pays automatically.

```
1. Agent → API: GET /premium-data
2. API → Agent: 402 Payment Required
   {
     "invoice": "legasi:pay:50USDC:recipient123",
     "expires": 1699999999
   }
3. Agent → Legasi: Borrow + Pay invoice
4. Legasi → Recipient: Transfer USDC
5. Agent → API: GET /premium-data (with payment proof)
6. API → Agent: 200 OK + data
```

```typescript
// Agent handles 402 automatically
const response = await fetch(apiUrl);

if (response.status === 402) {
  const invoice = await response.json();
  
  // Pay via Legasi
  await legasi.x402Pay({
    invoice: invoice.data,
    agent: agentPubkey,
  });
  
  // Retry with payment proof
  const data = await fetch(apiUrl, {
    headers: { 'X-Payment-Proof': proofSignature }
  });
}
```

---

### Flow 4: Reputation Building

Agent builds creditworthiness over time.

```typescript
// Check agent's reputation
const position = await legasi.getPosition(agentPubkey);

console.log({
  successfulRepayments: position.reputation.successfulRepayments,
  totalRepaidUsd: position.reputation.totalRepaidUsd,
  gadEvents: position.reputation.gadEvents,
  accountAgeDays: position.reputation.accountAgeDays,
  score: position.reputation.getScore(),
  ltvBonus: position.reputation.getLtvBonusBps() + ' bps',
});

// Output:
// {
//   successfulRepayments: 47,
//   totalRepaidUsd: 125000,
//   gadEvents: 0,
//   accountAgeDays: 90,
//   score: 430,
//   ltvBonus: '500 bps'  // +5% LTV!
// }
```

**Result:** Agent with good history gets +5% better borrowing terms.

---

## 💰 LP Flows

### Flow 5: Provide Liquidity

LPs deposit assets to earn yield from agent borrowing.

```typescript
// LP deposits USDC
await legasi.deposit({
  mint: USDC_MINT,
  amount: 100_000 * 1e6, // 100k USDC
});

// Check position
const lpPosition = await legasi.getLpPosition(wallet);
console.log({
  deposited: lpPosition.depositedAmount,
  shares: lpPosition.shares,
  earnedYield: lpPosition.accruedYield,
});
```

---

### Flow 6: Withdraw with Yield

```typescript
// LP withdraws principal + yield
await legasi.withdraw({
  mint: USDC_MINT,
  shares: lpPosition.shares, // All shares
});

// Receives: principal + accrued interest
```

---

## ⚡ Flash Loan Flow

### Flow 7: Arbitrage Bot

```typescript
// Atomic arbitrage in one transaction
await legasi.flashLoan({
  mint: USDC_MINT,
  amount: 1_000_000 * 1e6, // 1M USDC
  
  // Callback executed within the flash loan
  callback: async (borrowedAmount) => {
    // 1. Buy on DEX A (cheap)
    const tokens = await dexA.swap(USDC, TOKEN, borrowedAmount);
    
    // 2. Sell on DEX B (expensive)
    const profit = await dexB.swap(TOKEN, USDC, tokens);
    
    // 3. Repay flash loan + fee
    const fee = borrowedAmount * 0.0009; // 0.09%
    return borrowedAmount + fee;
    
    // 4. Keep profit!
  }
});
```

---

## 🛡️ Safety Flow

### Flow 8: Gradual Auto-Deleveraging

When collateral drops, GAD protects everyone.

```
Position: $10,000 collateral, $8,500 borrowed (85% LTV)
Price drops → LTV reaches 90%

GAD activates:
- Hour 1: Sell $500 collateral → repay $500 debt
- Hour 2: Sell $500 collateral → repay $500 debt
- Hour 3: Position now at 75% LTV ✓

No liquidation cascade. No MEV extraction.
Agent keeps remaining position.
```

```typescript
// Anyone can trigger GAD (permissionless)
await legasi.triggerGad({
  position: positionPubkey,
});

// Caller receives small reward for helping
```

---

## 📊 Checking Protocol Stats

```typescript
// Pool statistics
const pool = await legasi.getPool(USDC_MINT);
console.log({
  totalDeposits: pool.totalDeposits,
  totalBorrowed: pool.totalBorrowed,
  utilization: pool.utilization + '%',
  supplyApy: pool.supplyApy + '%',
  borrowApy: pool.borrowApy + '%',
});

// Protocol-wide stats
const protocol = await legasi.getProtocolState();
console.log({
  totalAgents: protocol.totalAgents,
  totalBorrowVolume: protocol.totalBorrowVolume,
  avgReputationScore: protocol.avgReputationScore,
});
```

---

## 🔗 Devnet Addresses

| Program | Address |
|---------|---------|
| legasi-core | `4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy` |
| legasi-flash | `Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m` |
| legasi-gad | `89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK` |
| legasi-lending | *deploying...* |
| legasi-lp | *deploying...* |
| legasi-leverage | *deploying...* |

---

## Try It

```bash
# Clone
git clone https://github.com/legasicrypto/colosseum-agent-hackathon
cd colosseum-agent-hackathon

# Install
yarn install

# Run demo
yarn demo
```
