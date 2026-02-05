import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { BN, Wallet } from '@coral-xyz/anchor';

import { LegasiClient } from './client';
import { PROGRAM_IDS, DEFAULTS, DECIMALS } from './constants';
import { TxResult, LeverageParams } from './types';
import { solToLamports } from './utils';

/**
 * Client for One-Click Leverage operations
 * 
 * Enables opening leveraged positions in a single transaction
 * using flash loans and Jupiter swaps.
 * 
 * @example
 * ```typescript
 * const leverage = new LeverageClient(connection, wallet);
 * 
 * // Open 3x long SOL position with 1 SOL
 * await leverage.openLong({
 *   collateralAmount: 1,
 *   leverage: 3,
 *   direction: 'long',
 * });
 * 
 * // Close position
 * await leverage.close();
 * ```
 */
export class LeverageClient extends LegasiClient {
  constructor(connection: Connection, wallet: Wallet) {
    super(connection, wallet);
  }

  /**
   * Calculate maximum leverage based on LTV
   * @param maxLtvBps Maximum LTV in basis points
   * @returns Maximum leverage multiplier
   */
  calculateMaxLeverage(maxLtvBps: number = DEFAULTS.SOL_MAX_LTV_BPS): number {
    return 1 / (1 - maxLtvBps / 10000);
  }

  /**
   * Calculate liquidation price for a leveraged position
   */
  calculateLiquidationPrice(
    entryPrice: number,
    leverage: number,
    direction: 'long' | 'short',
    liquidationThresholdBps: number = DEFAULTS.LIQUIDATION_THRESHOLD_BPS
  ): number {
    const threshold = liquidationThresholdBps / 10000;
    
    if (direction === 'long') {
      // Long: liquidation when price drops
      return entryPrice * (1 - threshold / leverage);
    } else {
      // Short: liquidation when price rises
      return entryPrice * (1 + threshold / leverage);
    }
  }

  /**
   * Open a leveraged long position
   * 
   * This opens a long position by:
   * 1. Depositing initial collateral
   * 2. Borrowing stablecoins
   * 3. Swapping to more collateral (via Jupiter)
   * 4. Depositing swapped collateral
   */
  async openLong(params: LeverageParams): Promise<TxResult> {
    // Validate leverage
    const maxLeverage = this.calculateMaxLeverage();
    if (params.leverage > maxLeverage) {
      return {
        signature: '',
        success: false,
        error: `Leverage ${params.leverage}x exceeds max ${maxLeverage.toFixed(1)}x`,
      };
    }

    const collateralLamports = solToLamports(params.collateralAmount);
    const slippageBps = params.slippageBps ?? DEFAULTS.SLIPPAGE_BPS;

    try {
      // In production, this would:
      // 1. Calculate borrow amount
      // 2. Get Jupiter swap route
      // 3. Build atomic transaction with flash loan
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: this.getPositionPda()[0], isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        ],
        programId: PROGRAM_IDS.LEVERAGE,
        data: Buffer.concat([
          Buffer.from([0]), // open_leverage_long discriminator
          collateralLamports.toArrayLike(Buffer, 'le', 8),
          Buffer.from(new Uint16Array([Math.floor(params.leverage * 100)]).buffer),
          Buffer.from(new Uint16Array([slippageBps]).buffer),
        ]),
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Open a leveraged short position
   * 
   * This opens a short position by:
   * 1. Depositing stablecoin collateral
   * 2. Borrowing SOL
   * 3. Swapping SOL to more stablecoins (via Jupiter)
   * 4. Depositing swapped stablecoins
   */
  async openShort(params: LeverageParams): Promise<TxResult> {
    const maxLeverage = this.calculateMaxLeverage();
    if (params.leverage > maxLeverage) {
      return {
        signature: '',
        success: false,
        error: `Leverage ${params.leverage}x exceeds max ${maxLeverage.toFixed(1)}x`,
      };
    }

    const collateralAmount = new BN(
      params.collateralAmount * Math.pow(10, DECIMALS.USDC)
    );
    const slippageBps = params.slippageBps ?? DEFAULTS.SLIPPAGE_BPS;

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: this.getPositionPda()[0], isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        ],
        programId: PROGRAM_IDS.LEVERAGE,
        data: Buffer.concat([
          Buffer.from([1]), // open_leverage_short discriminator
          collateralAmount.toArrayLike(Buffer, 'le', 8),
          Buffer.from(new Uint16Array([Math.floor(params.leverage * 100)]).buffer),
          Buffer.from(new Uint16Array([slippageBps]).buffer),
        ]),
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Close leveraged position
   * 
   * This closes a position by:
   * 1. Flash borrowing to repay debt
   * 2. Withdrawing all collateral
   * 3. Swapping collateral to repay flash loan
   * 4. Returning remaining profit/loss
   */
  async close(slippageBps?: number): Promise<TxResult> {
    const slippage = slippageBps ?? DEFAULTS.SLIPPAGE_BPS;

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: this.getPositionPda()[0], isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        ],
        programId: PROGRAM_IDS.LEVERAGE,
        data: Buffer.concat([
          Buffer.from([2]), // close_leverage discriminator
          Buffer.from(new Uint16Array([slippage]).buffer),
        ]),
      });

      const tx = new Transaction().add(instruction);
      tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.wallet.publicKey;

      const signed = await this.wallet.signTransaction(tx);
      const signature = await this.connection.sendRawTransaction(signed.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      return { signature, success: true };
    } catch (error: any) {
      return {
        signature: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get current leverage position details
   */
  async getPosition(): Promise<{
    isOpen: boolean;
    direction: 'long' | 'short' | null;
    leverage: number;
    entryPrice: number | null;
    liquidationPrice: number | null;
    pnlPercent: number;
  } | null> {
    const position = await super.getPosition();
    if (!position) return null;
    
    const health = await this.getHealthStatus();
    
    // Simplified - in production, track entry price on-chain
    return {
      isOpen: health.debtValueUsd > 0,
      direction: health.debtValueUsd > 0 ? 'long' : null,
      leverage: health.collateralValueUsd / (health.collateralValueUsd - health.debtValueUsd) || 1,
      entryPrice: null, // Would be tracked on-chain
      liquidationPrice: health.liquidationPrice,
      pnlPercent: 0, // Would calculate from entry price
    };
  }
}
