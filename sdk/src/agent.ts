import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import { BN, Wallet } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

import { LegasiClient } from './client';
import { PROGRAM_IDS, SEEDS, DEFAULTS, DECIMALS } from './constants';
import {
  AgentConfigData,
  TxResult,
  AgentAlert,
  AlertCallback,
  HealthStatus,
} from './types';
import { findAgentConfigPda, sleep } from './utils';

/**
 * Agent configuration parameters
 */
export interface AgentConfig {
  /** Maximum daily borrow limit in USD */
  dailyBorrowLimitUsd: number;
  /** Enable automatic repayment when LTV exceeds threshold */
  autoRepayEnabled: boolean;
  /** LTV threshold to trigger auto-repay (in bps, e.g., 8000 = 80%) */
  autoRepayThresholdBps?: number;
  /** Enable x402 payment protocol for autonomous payments */
  x402Enabled: boolean;
  /** Daily limit for x402 payments in USD */
  x402DailyLimitUsd?: number;
  /** LTV threshold to trigger alerts (in bps) */
  alertThresholdBps?: number;
}

/**
 * Agent client for autonomous operations
 * 
 * This is the recommended client for AI agents. It provides:
 * - Autonomous borrowing within daily limits
 * - Auto-repayment when LTV gets dangerous
 * - x402 payment authorization
 * - Health monitoring with alerts
 * 
 * @example
 * ```typescript
 * const agent = new AgentClient(connection, wallet, {
 *   dailyBorrowLimitUsd: 1000,
 *   autoRepayEnabled: true,
 *   x402Enabled: true,
 * });
 * 
 * // Set up alerts
 * agent.onAlert((alert) => {
 *   console.log(`Alert: ${alert.message}`);
 * });
 * 
 * // Start monitoring
 * agent.startMonitoring();
 * 
 * // Autonomous borrow (within limits)
 * await agent.autonomousBorrow(50, usdcMint);
 * ```
 */
export class AgentClient extends LegasiClient {
  private config: AgentConfig;
  private agentConfigPda: PublicKey | null = null;
  private alertCallbacks: AlertCallback[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    connection: Connection,
    wallet: Wallet,
    config: AgentConfig
  ) {
    super(connection, wallet);
    this.config = {
      autoRepayThresholdBps: DEFAULTS.GAD_START_THRESHOLD_BPS,
      x402DailyLimitUsd: config.dailyBorrowLimitUsd / 10,
      alertThresholdBps: 7500, // 75%
      ...config,
    };
  }

  /**
   * Get agent config PDA
   */
  getAgentConfigPda(): PublicKey {
    if (this.agentConfigPda) return this.agentConfigPda;
    
    const [positionPda] = this.getPositionPda();
    const [configPda] = findAgentConfigPda(positionPda, PROGRAM_IDS.LENDING);
    
    this.agentConfigPda = configPda;
    return configPda;
  }

  /**
   * Initialize or update agent configuration on-chain
   */
  async configureAgent(): Promise<TxResult> {
    const [positionPda] = this.getPositionPda();
    const agentConfigPda = this.getAgentConfigPda();

    const dailyBorrowLimit = new BN(
      this.config.dailyBorrowLimitUsd * Math.pow(10, DECIMALS.USDC)
    );

    try {
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: positionPda, isSigner: false, isWritable: false },
          { pubkey: agentConfigPda, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_IDS.LENDING,
        data: Buffer.concat([
          Buffer.from([10]), // configure_agent discriminator
          dailyBorrowLimit.toArrayLike(Buffer, 'le', 8),
          Buffer.from([this.config.autoRepayEnabled ? 1 : 0]),
          Buffer.from([this.config.x402Enabled ? 1 : 0]),
          Buffer.from(new Uint16Array([this.config.alertThresholdBps!]).buffer),
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
   * Autonomous borrow within daily limits
   * 
   * This is the main entry point for agents to borrow.
   * It checks limits and auto-repay settings before borrowing.
   * 
   * @param amountUsd Amount to borrow in USD
   * @param mint Token mint to borrow
   */
  async autonomousBorrow(amountUsd: number, mint: PublicKey): Promise<TxResult> {
    // Check daily limit
    const config = await this.getAgentConfig();
    if (config) {
      const used = config.dailyBorrowUsed.toNumber() / Math.pow(10, DECIMALS.USDC);
      const limit = config.dailyBorrowLimit.toNumber() / Math.pow(10, DECIMALS.USDC);
      
      if (used + amountUsd > limit) {
        this.emitAlert({
          type: 'daily_limit_reached',
          message: `Daily borrow limit reached. Used: $${used.toFixed(2)}, Limit: $${limit.toFixed(2)}`,
          timestamp: new Date(),
          data: { used, limit, requested: amountUsd },
        });
        
        return {
          signature: '',
          success: false,
          error: `Daily limit exceeded. Available: $${(limit - used).toFixed(2)}`,
        };
      }
    }

    // Check health before borrowing
    const health = await this.getHealthStatus();
    if (!health.isHealthy) {
      return {
        signature: '',
        success: false,
        error: `Position unhealthy. Health factor: ${health.healthFactor.toFixed(2)}`,
      };
    }

    // Check if we can borrow this amount
    if (amountUsd > health.availableToBorrow) {
      return {
        signature: '',
        success: false,
        error: `Insufficient collateral. Max borrow: $${health.availableToBorrow.toFixed(2)}`,
      };
    }

    // Execute borrow
    return this.borrow({ amount: amountUsd, mint });
  }

  /**
   * Autonomous repay to maintain health
   * 
   * Called automatically when auto-repay is enabled and LTV exceeds threshold.
   * 
   * @param amountUsd Amount to repay in USD (or 'auto' for minimum needed)
   * @param mint Token mint to repay
   */
  async autonomousRepay(
    amountUsd: number | 'auto',
    mint: PublicKey
  ): Promise<TxResult> {
    const health = await this.getHealthStatus();
    
    let repayAmount: number;
    
    if (amountUsd === 'auto') {
      // Calculate minimum repay to get back under threshold
      const targetLtv = (this.config.autoRepayThresholdBps! - 500) / 100; // 5% buffer
      const targetDebt = health.collateralValueUsd * (targetLtv / 100);
      repayAmount = Math.max(0, health.debtValueUsd - targetDebt);
      
      if (repayAmount < 1) {
        return {
          signature: '',
          success: true,
          error: 'No repayment needed',
        };
      }
    } else {
      repayAmount = amountUsd;
    }

    this.emitAlert({
      type: 'auto_repay',
      message: `Auto-repaying $${repayAmount.toFixed(2)} to maintain health`,
      timestamp: new Date(),
      data: { amount: repayAmount, currentLtv: health.ltv },
    });

    return this.repay({ amount: repayAmount, mint });
  }

  /**
   * Check if x402 payment is authorized
   */
  async canMakeX402Payment(amountUsd: number): Promise<boolean> {
    if (!this.config.x402Enabled) return false;
    
    const config = await this.getAgentConfig();
    if (!config || !config.x402Enabled) return false;
    
    const used = config.x402DailyUsed.toNumber() / Math.pow(10, DECIMALS.USDC);
    const limit = config.x402DailyLimit.toNumber() / Math.pow(10, DECIMALS.USDC);
    
    return used + amountUsd <= limit;
  }

  /**
   * Register alert callback
   */
  onAlert(callback: AlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Start health monitoring loop
   * @param intervalMs Check interval in milliseconds (default: 60000)
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      await this.checkHealth();
    }, intervalMs);

    // Immediate first check
    this.checkHealth();
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check health and trigger alerts/actions
   */
  private async checkHealth(): Promise<void> {
    const health = await this.getHealthStatus();
    
    // Check for LTV warning
    if (health.ltv > this.config.alertThresholdBps! / 100) {
      this.emitAlert({
        type: 'ltv_warning',
        message: `LTV warning: ${health.ltv.toFixed(1)}% (threshold: ${this.config.alertThresholdBps! / 100}%)`,
        timestamp: new Date(),
        data: health,
      });
    }

    // Check for GAD activation
    if (health.gadActive) {
      this.emitAlert({
        type: 'gad_triggered',
        message: `GAD protection active. LTV: ${health.ltv.toFixed(1)}%`,
        timestamp: new Date(),
        data: health,
      });
    }

    // Auto-repay if enabled and threshold exceeded
    if (
      this.config.autoRepayEnabled &&
      health.ltv > this.config.autoRepayThresholdBps! / 100
    ) {
      const position = await this.getPosition();
      if (position?.debtMint) {
        await this.autonomousRepay('auto', position.debtMint);
      }
    }
  }

  /**
   * Emit alert to all registered callbacks
   */
  private emitAlert(alert: AgentAlert): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('Alert callback error:', error);
      }
    }
  }

  /**
   * Get on-chain agent configuration
   */
  private async getAgentConfig(): Promise<AgentConfigData | null> {
    const agentConfigPda = this.getAgentConfigPda();
    
    try {
      const account = await this.connection.getAccountInfo(agentConfigPda);
      if (!account) return null;
      
      // In production, decode from account data
      // This is a mock response
      return {
        position: this.getPositionPda()[0],
        dailyBorrowLimit: new BN(this.config.dailyBorrowLimitUsd * Math.pow(10, DECIMALS.USDC)),
        dailyBorrowUsed: new BN(0),
        lastResetDay: new BN(Math.floor(Date.now() / (24 * 60 * 60 * 1000))),
        autoRepayEnabled: this.config.autoRepayEnabled,
        autoRepayThresholdBps: this.config.autoRepayThresholdBps!,
        x402Enabled: this.config.x402Enabled,
        x402DailyLimit: new BN(this.config.x402DailyLimitUsd! * Math.pow(10, DECIMALS.USDC)),
        x402DailyUsed: new BN(0),
        alertThresholdBps: this.config.alertThresholdBps!,
        bump: 0,
      };
    } catch {
      return null;
    }
  }
}
