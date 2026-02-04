# 🎬 LEGASI Demo Flows

## 1. Basic User Flow

### 1.1 Initialize Position
```typescript
// User connects wallet and creates a position
await legasi.initializePosition();
```

### 1.2 Deposit Collateral (SOL)
```typescript
// Deposit 10 SOL as collateral
await legasi.depositSol(10);
// Position now has: 10 SOL collateral (~$1500 at $150/SOL)
```

### 1.3 Borrow USDC
```typescript
// Borrow $500 USDC (33% LTV)
await legasi.borrow(500);
// Max borrow at 75% LTV would be $1125
```

### 1.4 Repay Loan
```typescript
// Repay $250 of the loan
await legasi.repay(250);
// Remaining debt: $250 + accrued interest
```

### 1.5 Withdraw Collateral
```typescript
// Withdraw 3 SOL (still safe LTV)
await legasi.withdraw(3);
```

---

## 2. Agent Flow

### 2.1 Configure Agent
```typescript
// Enable agent with $1000/day limit
await legasi.configureAgent({
  dailyBorrowLimit: 1000,
  autoRepayEnabled: true,
  x402Enabled: true,
  alertThresholdBps: 7500  // Alert at 75% LTV
});
```

### 2.2 Agent Autonomous Borrow
```typescript
// Agent needs to pay for an API call
// Agent borrows $50 (within daily limit)
await program.methods
  .agentBorrow(new BN(50_000_000)) // 50 USDC
  .accounts({...})
  .rpc();

// Daily limit updated: $950 remaining for today
```

### 2.3 x402 Payment Flow
```
1. Agent → OpenAI API: "Generate text"
2. API → Agent: HTTP 402 Payment Required
   {
     recipient: "5xyz...",
     amount: 0.01 USDC,
     payment_id: "abc123...",
     expires_at: 1707123456
   }

3. Agent → Legasi: x402_pay(payment_request, auto_borrow=true)
   - If agent wallet has 0.01 USDC: Pay directly
   - If not: Borrow 0.01 USDC first, then pay
   - Receipt created on-chain

4. Agent → OpenAI API: "Generate text" + payment_proof
5. API → Agent: Generated text ✅
```

### 2.4 Auto-Repay
```typescript
// Agent receives payment from user (e.g., 100 USDC)
// Auto-repay triggers automatically
await program.methods
  .agentAutoRepay(new BN(100_000_000))
  .accounts({...})
  .rpc();

// Debt reduced by 100 USDC
// Reputation score increases
```

---

## 3. LP (Liquidity Provider) Flow

### 3.1 Deposit to Pool
```typescript
// LP deposits 10,000 USDC to earn yield
await legasi.lpDeposit(10000);
// Receives: bUSDC LP tokens representing share
```

### 3.2 Earn Yield
```
- Borrowers pay interest (dynamic rate based on utilization)
- Interest accrues to the pool
- LP's bUSDC tokens appreciate in value
- Current APY: ~8-15% depending on utilization
```

### 3.3 Withdraw
```typescript
// LP withdraws (burns bUSDC, receives USDC + yield)
await legasi.lpWithdraw(5000);
// Receives: 5000 USDC + accumulated yield
```

---

## 4. GAD (Gradual Auto-Deleveraging) Flow

### 4.1 Normal Operation
```
Position: 10 SOL ($1500), $800 borrowed
LTV: 53% ✅ Safe
```

### 4.2 Price Drops
```
SOL drops to $100
Position: 10 SOL ($1000), $800 borrowed
LTV: 80% ⚠️ Above threshold (77%)
```

### 4.3 GAD Triggers (permissionless crank)
```typescript
// Anyone can call this to start GAD
await program.methods
  .crankGad()
  .accounts({ position: positionPda, ... })
  .rpc();

// GAD sells small amount of collateral:
// - Sells 0.5 SOL ($50) on Jupiter
// - Repays $50 of debt
// - New LTV: 75% (back to safe zone)

// No harsh liquidation!
// User keeps most of their position
```

### 4.4 GAD Benefits vs Traditional Liquidation

| | Traditional | GAD |
|---|---|---|
| **Trigger** | 80% LTV | 77% LTV |
| **Action** | Liquidate everything | Sell 2-5% of collateral |
| **User Loss** | 10-15% penalty | ~0.5% slippage |
| **Speed** | Instant (MEV vulnerable) | Gradual (MEV resistant) |
| **Result** | Position closed | Position saved |

---

## 5. Flash Loan Flow

### 5.1 Arbitrage Example
```typescript
// Borrow 100,000 USDC in a flash loan
const flashLoan = await program.methods
  .flashBorrow(new BN(100_000_000_000))
  .accounts({...})
  .rpc();

// Within the same transaction:
// 1. Buy SOL cheap on DEX A
// 2. Sell SOL expensive on DEX B
// 3. Repay 100,000 USDC + 0.09% fee (90 USDC)
// 4. Keep the profit!

await program.methods
  .flashRepay(new BN(100_090_000_000))
  .accounts({...})
  .rpc();
```

### 5.2 Collateral Swap
```typescript
// User wants to switch from SOL to cbBTC collateral
// Without closing position:

// 1. Flash borrow USDC to repay all debt
// 2. Withdraw SOL collateral
// 3. Swap SOL → cbBTC on Jupiter
// 4. Deposit cbBTC as collateral
// 5. Borrow USDC again
// 6. Repay flash loan

// All in one atomic transaction!
```

---

## 6. One-Click Leverage Flow

### 6.1 Open 3x Long SOL
```typescript
// User has 10 SOL, wants 3x exposure
await program.methods
  .openLeveragePosition(
    new BN(10 * LAMPORTS_PER_SOL), // 10 SOL
    3, // 3x target leverage
  )
  .accounts({...})
  .rpc();

// What happens internally:
// 1. Deposit 10 SOL as collateral ($1500)
// 2. Borrow $1000 USDC (66% LTV)
// 3. Swap $1000 USDC → 6.67 SOL on Jupiter
// 4. Deposit 6.67 SOL as additional collateral
// 5. Repeat until 3x achieved

// Result: ~30 SOL exposure from 10 SOL initial
```

### 6.2 Close Leveraged Position
```typescript
await program.methods
  .closeLeveragePosition()
  .accounts({...})
  .rpc();

// Unwinds the position:
// 1. Withdraw excess collateral
// 2. Swap SOL → USDC
// 3. Repay debt
// 4. Return remaining SOL to user
```

---

## 7. Off-Ramp Flow (Bridge.xyz Integration)

### 7.1 Borrow and Off-Ramp to Bank
```typescript
// User wants to receive EUR in their bank account
await program.methods
  .offrampViaBridge(
    requestId,
    new BN(1000_000_000), // 1000 USDC
    "FR7630006000011234567890189", // IBAN
    "John Doe" // Recipient name
  )
  .accounts({...})
  .rpc();

// 1. Burns 1000 USDC from user's borrowed balance
// 2. Creates OfframpRequest on-chain
// 3. Bridge.xyz webhook picks it up
// 4. User receives ~920 EUR in bank (after fees)
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Max LTV | 75% (+5% reputation bonus) |
| Liquidation Threshold | 80% |
| GAD Trigger | 77% |
| Flash Loan Fee | 0.09% |
| Base Interest Rate | 2% APR |
| Max Interest Rate | 50% APR (at 100% utilization) |
| Agent Daily Limit | Configurable per position |

---

## CLI Commands (for testing)

```bash
# Build all programs
anchor build

# Run tests
anchor test

# Deploy to localnet
solana-test-validator &
anchor deploy --provider.cluster localnet

# Deploy to devnet (needs ~5 SOL)
solana config set --url devnet
anchor deploy --provider.cluster devnet
```
