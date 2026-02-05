import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { BN, Wallet } from '@coral-xyz/anchor';

import { LegasiClient } from './client';
import { PROGRAM_IDS, DEFAULTS } from './constants';
import { GadConfigData, TxResult } from './types';
import { findGadConfigPda } from './utils';

/**
 * GAD (Gradual Auto-Deleveraging) configuration
 */
export interface GadSettings {
  /** Enable GAD protection */
  enabled: boolean;
  /** LTV threshold to start deleveraging (in bps, e.g., 8000 = 80%) */
  startThresholdBps?: number;
  /** Amount to deleverage per step (in bps of collateral) */
  stepSizeBps?: number;
  /** Minimum time between steps (in seconds) */
  minIntervalSeconds?: number;
}

/**
 * Client for GAD (Gradual Auto-Deleveraging) operations
 * 
 * GAD provides MEV-resistant protection against sudden liquidations.
 * Instead of liquidating 100% of a position when LTV exceeds threshold,
 * GAD gradually sells collateral to repay debt over time.
 * 
 * @example
 * ```typescript
 * const gad = new GadClient(connection, wallet);
 * 
 * // Enable GAD protection
 * await gad.configure({
 *   enabled: true,
 *   startThresholdBps: 8000, // Start at 80% LTV
 *   stepSizeBps: 500, // Sell 5% per step
 *   minIntervalSeconds: 3600, // 1 hour between steps
 * });
 * 
 * // Check GAD status
 * const status = await gad.getStatus();
 * ```
 */
export class GadClient extends LegasiClient {
  private gadConfigPda: PublicKey | null = null;

  constructor(connection: Connection, wallet: Wallet) {
    super(connection, wallet);
  }

  /**
   * Get GAD config PDA
   */
  getGadConfigPda(): PublicKey {
    if (this.gadConfigPda) return this.gadConfigPda;
    
    const [positionPda] = this.getPositionPda();
    const [configPda] = findGadConfigPda(positionPda, PROGRAM_IDS.GAD);
    
    this.gadConfigPda = configPda;
    return configPda;
  }

  /**
   * Configure GAD protection
   */
  async configure(settings: GadSettings): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    const gadConfigPda = this.getGadConfigPda();

    const config = {
      startThresholdBps: settings.startThresholdBps ?? DEFAULTS.GAD_START_THRESHOLD_BPS,
      stepSizeBps: settings.stepSizeBps ?? DEFAULTS.GAD_STEP_SIZE_BPS,
      minIntervalSeconds: settings.minIntervalSeconds ?? DEFAULTS.GAD_MIN_INTERVAL_SECONDS,
    };

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: gadConfigPda, isSigner: false, isWritable: true },
          { pubkey: positionPda, isSigner: false, isWritable: false },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.GAD,
        data: Buffer.concat([
          Buffer.from([0]), // configure_gad discriminator
          Buffer.from([settings.enabled ? 1 : 0]),
          Buffer.from(new Uint16Array([config.startThresholdBps]).buffer),
          Buffer.from(new Uint16Array([config.stepSizeBps]).buffer),
          Buffer.from(new Uint32Array([config.minIntervalSeconds]).buffer),
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
   * Enable GAD with default settings
   */
  async enable(): Promise<TxResult> {
    return this.configure({ enabled: true });
  }

  /**
   * Disable GAD protection
   */
  async disable(): Promise<TxResult> {
    return this.configure({ enabled: false });
  }

  /**
   * Get current GAD configuration
   */
  async getConfig(): Promise<GadConfigData | null> {
    const gadConfigPda = this.getGadConfigPda();
    
    try {
      const account = await this.connection.getAccountInfo(gadConfigPda);
      if (!account) return null;
      
      // In production, decode from account data
      return {
        position: this.getPositionPda()[0],
        enabled: false,
        startThresholdBps: DEFAULTS.GAD_START_THRESHOLD_BPS,
        stepSizeBps: DEFAULTS.GAD_STEP_SIZE_BPS,
        minIntervalSeconds: DEFAULTS.GAD_MIN_INTERVAL_SECONDS,
        lastExecutionTime: new BN(0),
        totalStepsExecuted: 0,
        totalAmountDeleveraged: new BN(0),
        bump: 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get GAD status summary
   */
  async getStatus(): Promise<{
    enabled: boolean;
    isActive: boolean;
    stepsExecuted: number;
    totalDeleveraged: number;
    nextStepAvailableAt: Date | null;
  }> {
    const config = await this.getConfig();
    const health = await this.getHealthStatus();
    
    if (!config) {
      return {
        enabled: false,
        isActive: false,
        stepsExecuted: 0,
        totalDeleveraged: 0,
        nextStepAvailableAt: null,
      };
    }

    const isActive = config.enabled && health.ltv > config.startThresholdBps / 100;
    const nextStepTime = config.lastExecutionTime.toNumber() + config.minIntervalSeconds;
    
    return {
      enabled: config.enabled,
      isActive,
      stepsExecuted: config.totalStepsExecuted,
      totalDeleveraged: config.totalAmountDeleveraged.toNumber(),
      nextStepAvailableAt: isActive ? new Date(nextStepTime * 1000) : null,
    };
  }

  /**
   * Execute GAD crank (keeper function)
   * 
   * This is typically called by keepers, not users directly.
   * It executes one step of gradual deleveraging if conditions are met.
   */
  async crank(): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    const gadConfigPda = this.getGadConfigPda();

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: gadConfigPda, isSigner: false, isWritable: true },
          { pubkey: positionPda, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          // Additional accounts for swap would go here
        ],
        programId: PROGRAM_IDS.GAD,
        data: Buffer.from([1]), // crank_gad discriminator
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
}
