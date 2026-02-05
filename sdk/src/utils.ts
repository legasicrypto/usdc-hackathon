import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { DECIMALS, DEFAULTS } from './constants';

/**
 * Calculate Loan-to-Value ratio
 * @param collateralValueUsd Collateral value in USD (6 decimals)
 * @param debtValueUsd Debt value in USD (6 decimals)
 * @returns LTV as a percentage (0-100)
 */
export function calculateLTV(collateralValueUsd: number, debtValueUsd: number): number {
  if (collateralValueUsd === 0) return 0;
  return (debtValueUsd / collateralValueUsd) * 100;
}

/**
 * Calculate health factor
 * @param collateralValueUsd Collateral value in USD
 * @param debtValueUsd Debt value in USD
 * @param liquidationThresholdBps Liquidation threshold in basis points
 * @returns Health factor (> 1 is healthy, < 1 is liquidatable)
 */
export function calculateHealthFactor(
  collateralValueUsd: number,
  debtValueUsd: number,
  liquidationThresholdBps: number = DEFAULTS.LIQUIDATION_THRESHOLD_BPS
): number {
  if (debtValueUsd === 0) return Infinity;
  const liquidationThreshold = liquidationThresholdBps / 10000;
  return (collateralValueUsd * liquidationThreshold) / debtValueUsd;
}

/**
 * Calculate liquidation price for collateral
 * @param collateralAmount Amount of collateral
 * @param debtValueUsd Debt value in USD
 * @param liquidationThresholdBps Liquidation threshold in basis points
 * @returns Price at which position would be liquidated
 */
export function calculateLiquidationPrice(
  collateralAmount: number,
  debtValueUsd: number,
  liquidationThresholdBps: number = DEFAULTS.LIQUIDATION_THRESHOLD_BPS
): number | null {
  if (collateralAmount === 0 || debtValueUsd === 0) return null;
  const liquidationThreshold = liquidationThresholdBps / 10000;
  return debtValueUsd / (collateralAmount * liquidationThreshold);
}

/**
 * Calculate maximum borrowable amount
 * @param collateralValueUsd Collateral value in USD
 * @param currentDebtUsd Current debt in USD
 * @param maxLtvBps Maximum LTV in basis points
 * @returns Maximum additional amount that can be borrowed
 */
export function calculateMaxBorrow(
  collateralValueUsd: number,
  currentDebtUsd: number,
  maxLtvBps: number = DEFAULTS.SOL_MAX_LTV_BPS
): number {
  const maxDebt = (collateralValueUsd * maxLtvBps) / 10000;
  return Math.max(0, maxDebt - currentDebtUsd);
}

/**
 * Calculate reputation bonus LTV
 * @param reputationScore Current reputation score
 * @returns Bonus LTV in basis points
 */
export function calculateReputationBonus(reputationScore: number): number {
  if (reputationScore >= 400) return 500; // +5%
  if (reputationScore >= 200) return 300; // +3%
  return 0;
}

/**
 * Format USD amount for display
 * @param amountUsd6dec Amount in USD with 6 decimals
 * @returns Formatted string like "$1,234.56"
 */
export function formatUSD(amountUsd6dec: number | BN): string {
  const amount = typeof amountUsd6dec === 'number' 
    ? amountUsd6dec 
    : amountUsd6dec.toNumber();
  const usd = amount / Math.pow(10, DECIMALS.USD);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(usd);
}

/**
 * Format SOL amount for display
 * @param lamports Amount in lamports
 * @returns Formatted string like "1.234 SOL"
 */
export function formatSOL(lamports: number | BN): string {
  const amount = typeof lamports === 'number' 
    ? lamports 
    : lamports.toNumber();
  const sol = amount / Math.pow(10, DECIMALS.SOL);
  return `${sol.toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL`;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): BN {
  return new BN(Math.floor(sol * Math.pow(10, DECIMALS.SOL)));
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: BN | number): number {
  const amount = typeof lamports === 'number' ? lamports : lamports.toNumber();
  return amount / Math.pow(10, DECIMALS.SOL);
}

/**
 * Convert token amount to base units
 */
export function toBaseUnits(amount: number, decimals: number): BN {
  return new BN(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert base units to token amount
 */
export function fromBaseUnits(baseUnits: BN | number, decimals: number): number {
  const amount = typeof baseUnits === 'number' ? baseUnits : baseUnits.toNumber();
  return amount / Math.pow(10, decimals);
}

/**
 * Find PDA for position
 */
export function findPositionPda(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), owner.toBuffer()],
    programId
  );
}

/**
 * Find PDA for agent config
 */
export function findAgentConfigPda(
  position: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent_config'), position.toBuffer()],
    programId
  );
}

/**
 * Find PDA for GAD config
 */
export function findGadConfigPda(
  position: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('gad_config'), position.toBuffer()],
    programId
  );
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(baseDelayMs * Math.pow(2, i));
      }
    }
  }
  
  throw lastError;
}
