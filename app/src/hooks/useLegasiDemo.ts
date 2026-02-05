"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Demo position data
interface DemoPosition {
  owner: PublicKey;
  collaterals: { mint: PublicKey; amount: BN }[];
  borrows: { mint: PublicKey; amount: BN; accruedInterest: BN; borrowedAt: BN }[];
  reputation: {
    successfulRepayments: number;
    totalRepaidUsd: BN;
    gadEvents: number;
    accountAgeDays: number;
    lastUpdateSlot: BN;
  };
  bump: number;
}

// Fake TX hash generator
function fakeTxHash(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 88; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Simulated delay for realistic feel
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useLegasiDemo() {
  const wallet = useWallet();
  const [position, setPosition] = useState<DemoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize position (demo)
  const initializePosition = useCallback(async () => {
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    
    setLoading(true);
    setError(null);
    
    try {
      await delay(1500); // Simulate transaction time
      
      const newPosition: DemoPosition = {
        owner: wallet.publicKey,
        collaterals: [],
        borrows: [],
        reputation: {
          successfulRepayments: 0,
          totalRepaidUsd: new BN(0),
          gadEvents: 0,
          accountAgeDays: 1,
          lastUpdateSlot: new BN(0),
        },
        bump: 255,
      };
      
      setPosition(newPosition);
      return fakeTxHash();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  // Deposit SOL (demo)
  const depositSol = useCallback(async (amount: number) => {
    if (!wallet.publicKey || !position) throw new Error("Not ready");
    
    setLoading(true);
    setError(null);
    
    try {
      await delay(1500);
      
      const solMint = new PublicKey("So11111111111111111111111111111111111111112");
      const existingCollateral = position.collaterals.find(c => c.mint.equals(solMint));
      
      const newCollaterals = existingCollateral
        ? position.collaterals.map(c => 
            c.mint.equals(solMint) 
              ? { ...c, amount: c.amount.add(new BN(amount * 1e9)) }
              : c
          )
        : [...position.collaterals, { mint: solMint, amount: new BN(amount * 1e9) }];
      
      setPosition({ ...position, collaterals: newCollaterals });
      return fakeTxHash();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, position]);

  // Borrow USDC (demo)
  const borrow = useCallback(async (amount: number) => {
    if (!wallet.publicKey || !position) throw new Error("Not ready");
    
    setLoading(true);
    setError(null);
    
    try {
      await delay(1500);
      
      const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      const existingBorrow = position.borrows.find(b => b.mint.equals(usdcMint));
      
      const newBorrows = existingBorrow
        ? position.borrows.map(b => 
            b.mint.equals(usdcMint) 
              ? { ...b, amount: b.amount.add(new BN(amount * 1e6)) }
              : b
          )
        : [...position.borrows, { 
            mint: usdcMint, 
            amount: new BN(amount * 1e6),
            accruedInterest: new BN(0),
            borrowedAt: new BN(Date.now() / 1000),
          }];
      
      setPosition({ ...position, borrows: newBorrows });
      return fakeTxHash();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, position]);

  // Configure agent (demo)
  const configureAgent = useCallback(async (
    dailyLimit: number,
    autoRepay: boolean,
    x402Enabled: boolean
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      await delay(1500);
      console.log("Demo: Agent configured", { dailyLimit, autoRepay, x402Enabled });
      return fakeTxHash();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // LP Deposit (demo)
  const lpDeposit = useCallback(async (amount: number) => {
    setLoading(true);
    setError(null);
    
    try {
      await delay(1500);
      console.log("Demo: LP deposited", amount);
      return fakeTxHash();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate current LTV
  const calculateLTV = useCallback(() => {
    if (!position) return 0;
    
    const totalCollateralUsd = position.collaterals.reduce((sum, c) => {
      const price = 100_000_000; // $100 per SOL
      return sum + (c.amount.toNumber() * price / 1e9);
    }, 0);
    
    const totalBorrowUsd = position.borrows.reduce((sum, b) => {
      return sum + b.amount.toNumber() + b.accruedInterest.toNumber();
    }, 0);
    
    if (totalCollateralUsd === 0) return 0;
    return (totalBorrowUsd / totalCollateralUsd) * 100;
  }, [position]);

  return {
    client: wallet.publicKey ? {} : null, // Fake client
    position,
    loading,
    error,
    connected: !!wallet.publicKey,
    
    // Actions
    initializePosition,
    depositSol,
    borrow,
    configureAgent,
    lpDeposit,
    
    // Computed
    ltv: calculateLTV(),
    hasPosition: !!position,
    
    // Demo flag
    isDemo: true,
  };
}
