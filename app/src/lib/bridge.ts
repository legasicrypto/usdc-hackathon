/**
 * Bridge.xyz API Integration for Off-Ramp
 * 
 * Bridge allows users to convert crypto to fiat and withdraw to bank accounts.
 * For demo/hackathon: uses mock mode when API key not configured.
 * 
 * Docs: https://apidocs.bridge.xyz
 */

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'https://api.bridge.xyz/v0';
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || '';

// Types
export interface BridgeCustomer {
  id: string;
  email: string;
  full_name?: string;
  kyc_status: 'not_started' | 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface ExternalAccount {
  id: string;
  customer_id: string;
  bank_name: string;
  account_type: 'checking' | 'savings';
  last_four: string;
  currency: 'usd' | 'eur' | 'mxn' | 'brl' | 'gbp';
  created_at: string;
}

export interface TransferQuote {
  source_amount: string;
  source_currency: string;
  destination_amount: string;
  destination_currency: string;
  exchange_rate: string;
  fees: {
    bridge_fee: string;
    gas_fee: string;
    total: string;
  };
  expires_at: string;
}

export interface Transfer {
  id: string;
  state: 'awaiting_funds' | 'in_review' | 'funds_received' | 'payment_submitted' | 'payment_processed' | 'canceled' | 'returned' | 'refunded';
  amount: string;
  currency: string;
  source: {
    payment_rail: string;
    currency: string;
    from_address?: string;
  };
  destination: {
    payment_rail: string;
    currency: string;
    external_account_id?: string;
  };
  receipt?: {
    initial_amount: string;
    final_amount: string;
    exchange_fee: string;
    gas_fee: string;
  };
  created_at: string;
  updated_at: string;
}

// Check if we're in mock mode
export function isMockMode(): boolean {
  return !BRIDGE_API_KEY || BRIDGE_API_KEY === '';
}

// Helper for API calls
async function bridgeRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (isMockMode()) {
    throw new Error('Bridge API not configured - using mock mode');
  }

  const response = await fetch(`${BRIDGE_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Api-Key': BRIDGE_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Bridge API error');
  }

  return response.json();
}

// Generate mock data for demo
function generateMockId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create a customer (or return mock)
export async function createCustomer(
  email: string,
  fullName?: string
): Promise<BridgeCustomer> {
  if (isMockMode()) {
    return {
      id: generateMockId(),
      email,
      full_name: fullName,
      kyc_status: 'approved', // Mock always approved
      created_at: new Date().toISOString(),
    };
  }

  return bridgeRequest<BridgeCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      email,
      full_name: fullName,
    }),
  });
}

// Get a quote for off-ramp
export async function getOffRampQuote(
  sourceAmount: string,
  sourceCurrency: string = 'usdc',
  sourceChain: string = 'solana',
  destinationCurrency: string = 'usd'
): Promise<TransferQuote> {
  const amount = parseFloat(sourceAmount);
  
  if (isMockMode()) {
    // Mock quote with realistic fees
    const bridgeFee = amount * 0.001; // 0.1% Bridge fee
    const gasFee = 0.01; // ~$0.01 Solana gas
    const totalFees = bridgeFee + gasFee;
    const finalAmount = amount - totalFees;

    return {
      source_amount: sourceAmount,
      source_currency: sourceCurrency,
      destination_amount: finalAmount.toFixed(2),
      destination_currency: destinationCurrency,
      exchange_rate: '1.00', // USDC:USD 1:1
      fees: {
        bridge_fee: bridgeFee.toFixed(4),
        gas_fee: gasFee.toFixed(4),
        total: totalFees.toFixed(4),
      },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min
    };
  }

  // Real API call would go here
  return bridgeRequest<TransferQuote>('/quotes', {
    method: 'POST',
    body: JSON.stringify({
      source: {
        currency: sourceCurrency,
        payment_rail: sourceChain,
      },
      destination: {
        currency: destinationCurrency,
        payment_rail: 'ach',
      },
      amount: sourceAmount,
    }),
  });
}

// Create an off-ramp transfer
export async function createOffRampTransfer(params: {
  customerId: string;
  externalAccountId: string;
  sourceAmount: string;
  sourceCurrency?: string;
  sourceChain?: string;
  fromAddress: string;
}): Promise<Transfer> {
  const {
    customerId,
    externalAccountId,
    sourceAmount,
    sourceCurrency = 'usdc',
    sourceChain = 'solana',
    fromAddress,
  } = params;

  if (isMockMode()) {
    const quote = await getOffRampQuote(sourceAmount, sourceCurrency, sourceChain);
    
    return {
      id: generateMockId(),
      state: 'awaiting_funds',
      amount: sourceAmount,
      currency: 'usd',
      source: {
        payment_rail: sourceChain,
        currency: sourceCurrency,
        from_address: fromAddress,
      },
      destination: {
        payment_rail: 'ach',
        currency: 'usd',
        external_account_id: externalAccountId,
      },
      receipt: {
        initial_amount: sourceAmount,
        final_amount: quote.destination_amount,
        exchange_fee: quote.fees.bridge_fee,
        gas_fee: quote.fees.gas_fee,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return bridgeRequest<Transfer>('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      on_behalf_of: customerId,
      source: {
        currency: sourceCurrency,
        payment_rail: sourceChain,
        from_address: fromAddress,
      },
      destination: {
        currency: 'usd',
        payment_rail: 'ach',
        external_account_id: externalAccountId,
      },
      amount: sourceAmount,
    }),
  });
}

// Get transfer status
export async function getTransferStatus(transferId: string): Promise<Transfer> {
  if (isMockMode()) {
    // Simulate transfer progression
    return {
      id: transferId,
      state: 'payment_processed', // Mock completed
      amount: '100.00',
      currency: 'usd',
      source: {
        payment_rail: 'solana',
        currency: 'usdc',
      },
      destination: {
        payment_rail: 'ach',
        currency: 'usd',
      },
      receipt: {
        initial_amount: '100.00',
        final_amount: '99.89',
        exchange_fee: '0.10',
        gas_fee: '0.01',
      },
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return bridgeRequest<Transfer>(`/transfers/${transferId}`);
}

// Supported currencies and rails
export const SUPPORTED_SOURCE_CURRENCIES = [
  { currency: 'usdc', chain: 'solana', name: 'USDC (Solana)' },
  { currency: 'usdc', chain: 'ethereum', name: 'USDC (Ethereum)' },
  { currency: 'usdc', chain: 'polygon', name: 'USDC (Polygon)' },
];

export const SUPPORTED_DESTINATION_CURRENCIES = [
  { currency: 'usd', rail: 'ach', name: 'USD (ACH - US Bank)' },
  { currency: 'usd', rail: 'wire', name: 'USD (Wire Transfer)' },
  { currency: 'eur', rail: 'sepa', name: 'EUR (SEPA - EU Bank)' },
  { currency: 'mxn', rail: 'spei', name: 'MXN (SPEI - Mexico)' },
];
