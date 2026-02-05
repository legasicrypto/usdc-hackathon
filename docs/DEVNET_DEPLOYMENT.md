# Legasi Protocol - Devnet Deployment Guide

**Status:** ✅ DEPLOYED & LIVE  
**Last Updated:** 2026-02-05

## Live URLs

| Resource | URL |
|----------|-----|
| Dashboard | https://agentic.legasi.io/dashboard |
| Faucet | https://agentic.legasi.io/faucet |
| Landing | https://agentic.legasi.io |

## Deployed Program IDs

| Program | Address |
|---------|---------|
| Core | `4FW9iFaerNuX1GstRKSsWo9UfnTbjtqch3fEHkWMF1Uy` |
| Lending | `9356RoSbLTzWE55ab6GktcTocaNhPuBEDZvsmqjkCZYw` |
| LP | `CTwY4VSeueesSBc95G38X3WJYPriJEzyxjcCaZAc5LbY` |
| GAD | `89E84ALdDdGGNuJAxho2H45aC25kqNdGg7QtwTJ3pngK` |
| Flash | `Fj8CJNK1gBAuNR7dFbKLDckSstKmZn8ihTGwFXxfY93m` |
| Leverage | `AVATHjGrdQ1KqtjHQ4gwRcuAYjwwScwgPsujLDpiA2g3` |

## Test Tokens

| Token | Mint |
|-------|------|
| USDC | `3J2i1X4VGSxkEiHdnq4zead7hiSYbQHs9ZZaS36yAfX8` |
| EURC | `6KeaPv9QA3VYaf62dfDzC785U8Cfa5VbsgtBH5ZWWf7v` |

---

## Prerequisites

### 1. Install Solana CLI
```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### 2. Install Anchor CLI
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### 3. Setup Wallet
```bash
# Generate new keypair (or use existing)
solana-keygen new -o ~/.config/solana/id.json

# Configure for devnet
solana config set --url devnet

# Get devnet SOL
solana airdrop 2
```

## Deployment Steps

### Option A: Automated Script
```bash
cd /home/legasi/colosseum-agent-hackathon
chmod +x scripts/deploy-devnet.sh
./scripts/deploy-devnet.sh
```

### Option B: Manual Deployment

#### 1. Build Programs
```bash
anchor build
```

#### 2. Deploy Each Program
```bash
# Deploy core
anchor deploy --program-name legasi_core

# Deploy flash loans
anchor deploy --program-name legasi_flash

# Deploy GAD
anchor deploy --program-name legasi_gad

# Deploy lending
anchor deploy --program-name legasi_lending

# Deploy leverage
anchor deploy --program-name legasi_leverage

# Deploy LP
anchor deploy --program-name legasi_lp
```

#### 3. Initialize Protocol
```bash
npx ts-node scripts/init-devnet.ts
```

## Expected Program IDs

After deployment, you'll receive program IDs. Update `Anchor.toml`:

```toml
[programs.devnet]
legasi_core = "<YOUR_PROGRAM_ID>"
legasi_flash = "<YOUR_PROGRAM_ID>"
legasi_gad = "<YOUR_PROGRAM_ID>"
legasi_lending = "<YOUR_PROGRAM_ID>"
legasi_leverage = "<YOUR_PROGRAM_ID>"
legasi_lp = "<YOUR_PROGRAM_ID>"
```

## Program Architecture

| Program | Purpose | Key Instructions |
|---------|---------|------------------|
| legasi_core | Protocol state, config | initialize, update_config |
| legasi_lending | Deposits, borrows | deposit, borrow, repay, withdraw |
| legasi_gad | Graceful Adjustment Down | check_health, liquidate |
| legasi_flash | Flash loans | flash_loan, repay_flash |
| legasi_leverage | Long/short positions | leverage_long, leverage_short |
| legasi_lp | Liquidity provision | deposit_usdc, withdraw_usdc |

## Test Tokens

### Devnet SOL
```bash
solana airdrop 2  # Up to 2 SOL per request
```

### Test USDC
The init script creates a test USDC mint. Alternatively, use:
- **Circle Devnet Faucet:** https://faucet.circle.com/
- **Token Address:** Will be output by init script

## Verification

### Check Program Deployment
```bash
solana program show <PROGRAM_ID>
```

### Fetch IDL
```bash
anchor idl fetch <PROGRAM_ID> --provider.cluster devnet
```

### Test Transaction
```bash
# Using the SDK
npx ts-node -e "
const { LegasiAgentSDK } = require('./sdk/dist');
const sdk = new LegasiAgentSDK({ rpcUrl: 'https://api.devnet.solana.com' });
console.log('SDK initialized:', sdk);
"
```

## Troubleshooting

### "Blockhash not found"
The devnet may be congested. Retry or use a dedicated RPC:
- Helius: https://helius.xyz
- Triton: https://triton.one
- QuickNode: https://quicknode.com

### "Insufficient funds"
```bash
solana airdrop 2
# Wait 30 seconds between requests
```

### "Program deploy failed"
1. Check wallet balance: `solana balance`
2. Ensure build succeeded: `anchor build`
3. Check keypairs exist: `ls target/deploy/*.json`

## Configuration for Frontend

After deployment, update `app/.env.local`:
```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_LEGASI_CORE_PROGRAM_ID=<YOUR_PROGRAM_ID>
NEXT_PUBLIC_USDC_MINT=<TEST_USDC_MINT>
```

## Post-Deployment Checklist

- [ ] All 6 programs deployed
- [ ] Program IDs saved to Anchor.toml
- [ ] Test USDC mint created
- [ ] Protocol initialized
- [ ] SDK constants updated
- [ ] Frontend .env.local updated
- [ ] Test deposit/borrow cycle works
- [ ] IDL uploaded to anchor registry (optional)

## Security Notes

⚠️ **Devnet keys are for testing only.** Never use devnet keypairs on mainnet.

For mainnet deployment:
1. Generate fresh keypairs with proper security
2. Use hardware wallet or multisig
3. Complete security audit
4. Progressive rollout (testnet → devnet → mainnet-beta)
