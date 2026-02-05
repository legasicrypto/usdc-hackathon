/**
 * Legasi SDK - TypeScript client for AI agents
 * 
 * @example
 * ```typescript
 * import { LegasiClient } from '@legasi/sdk';
 * 
 * const client = new LegasiClient(connection, wallet);
 * 
 * // Deposit collateral
 * await client.depositSol(1.5);
 * 
 * // Borrow USDC
 * await client.borrow(usdcMint, 100);
 * 
 * // Check health
 * const health = await client.getHealthFactor();
 * ```
 */

export { LegasiClient } from './client';
export { AgentConfig, AgentClient } from './agent';
export { GadClient } from './gad';
export { FlashLoanClient } from './flash';
export { LeverageClient } from './leverage';

// Types
export * from './types';

// Constants
export * from './constants';

// Utils
export { 
  calculateLTV,
  calculateHealthFactor,
  calculateLiquidationPrice,
  formatUSD,
  formatSOL,
} from './utils';
