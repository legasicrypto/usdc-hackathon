# Security Audit Report

**Date:** 2026-02-04  
**Auditor:** Bouliche (AGI Legasi)  
**Status:** ⚠️ Dependencies reviewed - Mainnet audit required before production

---

## Executive Summary

This security audit covers dependency vulnerabilities for the Legasi Protocol smart contracts and frontend. Most critical vulnerabilities are in **transitive dependencies** from the Solana/Anchor ecosystem and cannot be directly upgraded without breaking changes.

**Key Finding:** The codebase is **acceptable for hackathon/devnet deployment** but requires a full smart contract audit before mainnet.

---

## 1. NPM Audit Results

### Root Package (Anchor Tests)
| Severity | Count | Package | Issue |
|----------|-------|---------|-------|
| 🔴 High | 3 | `bigint-buffer` | Buffer Overflow via `toBigIntLE()` |

**Details:**
- `bigint-buffer` → `@solana/buffer-layout-utils` → `@solana/spl-token`
- **Impact:** Potential buffer overflow in token operations
- **Mitigation:** Not fixable without downgrading to `@solana/spl-token@0.1.8` (breaking)
- **Status:** ⚠️ Accepted risk for hackathon - monitor upstream fixes

### Frontend App (`/app`)
| Severity | Count |
|----------|-------|
| 🟢 None | 0 |

**Result:** ✅ No vulnerabilities in frontend dependencies

---

## 2. Cargo Audit Results (Rust/Anchor)

### Critical Vulnerabilities (2)

| Crate | Version | Advisory | Severity |
|-------|---------|----------|----------|
| `curve25519-dalek` | 3.2.1 | RUSTSEC-2024-0344 | 🔴 High |
| `ed25519-dalek` | 1.0.1 | RUSTSEC-2022-0093 | 🔴 High |

#### RUSTSEC-2024-0344: curve25519-dalek timing attack
- **Issue:** Timing variability in `Scalar29::sub`/`Scalar52::sub`
- **Fix:** Upgrade to ≥4.1.3
- **Blocker:** `solana-program 1.18.26` pins this version
- **Impact:** Theoretical timing side-channel - not exploitable in our use case
- **Status:** ⚠️ Cannot upgrade without Solana SDK update

#### RUSTSEC-2022-0093: ed25519-dalek oracle attack
- **Issue:** Double Public Key Signing Function Oracle Attack
- **Fix:** Upgrade to ≥2.0
- **Blocker:** `solana-sdk 1.18.26` pins this version
- **Impact:** Only affects exotic signing scenarios we don't use
- **Status:** ⚠️ Cannot upgrade without Solana SDK update

### Warnings (6 - Unmaintained/Unsound)

| Crate | Advisory | Severity |
|-------|----------|----------|
| `atty` | RUSTSEC-2024-0375, RUSTSEC-2021-0145 | ⚠️ Unmaintained/Unsound |
| `bincode` | RUSTSEC-2025-0141 | ⚠️ Unmaintained |
| `derivative` | RUSTSEC-2024-0388 | ⚠️ Unmaintained |
| `paste` | RUSTSEC-2024-0436 | ⚠️ Unmaintained |
| `borsh` | RUSTSEC-2023-0033 | ⚠️ Unsound |

**Status:** All are transitive from `solana-program`/`anchor-lang` - cannot be fixed directly.

---

## 3. Smart Contract Security Review

### Access Control ✅
- [x] Owner-only functions properly gated
- [x] Protocol authority checks in place
- [x] User position ownership validated

### Arithmetic Safety ✅
- [x] `checked_add`, `checked_sub`, `checked_mul` used consistently
- [x] No integer overflow/underflow vulnerabilities detected
- [x] Safe division with zero-checks

### Reentrancy Protection ✅
- [x] Anchor's account validation prevents reentrancy
- [x] CPI calls properly ordered (state updates before transfers)

### Oracle Security ⚠️
- [ ] Currently uses mock price oracle
- [ ] **TODO:** Integrate Pyth/Switchboard with staleness checks
- [ ] **TODO:** Add deviation circuit breakers

### Flash Loan Security ✅
- [x] Same-transaction repayment enforced
- [x] Fee collection before profit
- [x] Callback pattern secure

### Liquidation Mechanism ✅
- [x] Health factor properly calculated
- [x] GAD (Gradual Auto-Deleveraging) curve implemented
- [x] Liquidation bonus reasonable (5%)

---

## 4. Recommendations

### For Hackathon (Current) ✅
1. ✅ Accept transitive dependency risks (Solana ecosystem-wide)
2. ✅ Document known vulnerabilities (this file)
3. ✅ Deploy only to devnet
4. ✅ No real funds at risk

### For Mainnet (Future) 🔒
1. **Professional Audit Required**
   - Recommended: OtterSec, Halborn, or Neodyme
   - Budget: $30-50k for comprehensive review
   
2. **Dependency Upgrades**
   - Wait for Solana SDK v2.x with fixed crypto crates
   - Consider Anchor v0.31+ when available
   
3. **Oracle Hardening**
   - Integrate Pyth price feeds with confidence intervals
   - Implement TWAP for liquidation prices
   - Add staleness checks (max 30s)
   
4. **Monitoring**
   - Set up Prometheus/Grafana for on-chain metrics
   - Alert on unusual liquidation patterns
   - Monitor TVL changes

---

## 5. Conclusion

| Category | Status |
|----------|--------|
| NPM Dependencies | ⚠️ 3 high (transitive, accepted) |
| Rust Dependencies | ⚠️ 2 high (transitive, accepted) |
| Smart Contract Logic | ✅ No critical issues found |
| Access Control | ✅ Properly implemented |
| Arithmetic Safety | ✅ Checked operations used |
| **Overall for Hackathon** | ✅ **APPROVED for devnet** |
| **Overall for Mainnet** | ❌ **Requires professional audit** |

---

*This audit is a preliminary review. Full mainnet deployment requires a professional third-party security audit.*
