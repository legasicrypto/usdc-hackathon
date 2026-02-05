# Hackathon Submission Checklist

**Deadline:** February 12, 2026
**Status:** ⏳ Final steps pending (human intervention required)

---

## ✅ Completed (Autonomous)

- [x] Smart contract: all features implemented
  - Core lending (deposit, borrow, repay, withdraw)
  - GAD (Gradual Auto-Deleveraging)
  - Flash loans
  - One-click leverage (long/short)
  - Auto-stake Jito
  - Reputation system
  - Multi-market architecture
  - eMode for correlated assets
  - Insurance fund
  
- [x] Frontend: fully functional
  - Landing page with waitlist
  - Dashboard with position overview
  - GAD visualization
  - Leverage slider
  - Reputation display
  - Off-ramp modal (Bridge.xyz integration)
  - Invite/referral system
  
- [x] SDK: `@legasi/agent-sdk`
  - TypeScript SDK for agent developers
  - x402 payment protocol support
  - Health monitoring
  - Examples included
  
- [x] Documentation
  - README.md (comprehensive)
  - ARCHITECTURE.md
  - SECURITY.md
  - SECURITY_AUDIT.md
  - DEMO.md
  - PITCH.pdf (14 slides)
  - DEVNET_DEPLOYMENT.md
  - VERCEL_DEPLOYMENT.md

- [x] Deployment scripts ready
  - `scripts/deploy-devnet.sh`
  - `scripts/init-devnet.ts`
  - `scripts/deploy-vercel.sh`

---

## ⏳ Pending (Human Required)

### 1. Vercel Deployment
```bash
# On your local machine:
cd /home/legasi/colosseum-agent-hackathon

# Login to Vercel (interactive)
vercel login

# Deploy
./scripts/deploy-vercel.sh

# Or manually:
cd app && vercel --prod
```

After deployment:
- [ ] Update README.md with actual Vercel URL
- [ ] Test all pages work correctly
- [ ] Test waitlist signup flow

### 2. Demo Video (3-5 minutes)
Record a walkthrough showing:
1. **Landing page** - explain value proposition (30s)
2. **Deposit** - add collateral (30s)
3. **Borrow** - take a loan (30s)
4. **Reputation** - show score building (30s)
5. **GAD** - demonstrate gradual deleveraging (60s)
6. **Leverage** - one-click 3x long position (60s)
7. **x402** - agent auto-borrowing for API payment (60s)

Tools:
- Screen recording: OBS, Loom, or QuickTime
- Upload to: YouTube (unlisted) or Loom
- Add link to README.md

### 3. Devnet Deployment (Optional but recommended)
```bash
# On machine with Solana CLI:
./scripts/deploy-devnet.sh

# Initialize protocol:
npx ts-node scripts/init-devnet.ts
```

### 4. Submit to Colosseum
- [ ] Go to Colosseum submission portal
- [ ] Fill in team info
- [ ] Add GitHub repo link: https://github.com/legasiio/colosseum-agent-hackathon
- [ ] Add demo video link
- [ ] Add live demo link (Vercel)
- [ ] Submit before Feb 12, 2026

---

## Quick Links

| Resource | Link |
|----------|------|
| GitHub Repo | https://github.com/legasiio/colosseum-agent-hackathon |
| Pitch Deck | `docs/PITCH.pdf` |
| Demo Guide | `DEMO.md` |
| Architecture | `docs/ARCHITECTURE.md` |

---

## Pre-Submission Verification

Before submitting, verify:

- [ ] README has correct demo URL
- [ ] README has correct video URL
- [ ] All links in README work
- [ ] Vercel app loads without errors
- [ ] Wallet connect works on Vercel
- [ ] Pitch deck is accessible

---

*Last updated: 2026-02-05 by Bouliche 🎱*
