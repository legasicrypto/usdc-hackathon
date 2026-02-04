import { NextResponse } from 'next/server';
import {
  createCustomer,
  createOffRampTransfer,
  getTransferStatus,
  isMockMode,
} from '@/lib/bridge';

// POST /api/offramp/transfer - Create a new off-ramp transfer
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      email,
      amount,
      currency = 'usdc',
      chain = 'solana',
      walletAddress,
      bankAccountId,
    } = body;

    // Validate required fields
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // In mock mode, we simulate the whole flow
    // In production, you'd have KYC and bank account linking first
    
    // 1. Create or get customer
    const customer = await createCustomer(email);

    // 2. For demo, use a mock bank account ID
    const accountId = bankAccountId || 'mock-bank-account-001';

    // 3. Create the transfer
    const transfer = await createOffRampTransfer({
      customerId: customer.id,
      externalAccountId: accountId,
      sourceAmount: amount,
      sourceCurrency: currency,
      sourceChain: chain,
      fromAddress: walletAddress,
    });

    return NextResponse.json({
      success: true,
      transfer,
      customer: {
        id: customer.id,
        kycStatus: customer.kyc_status,
      },
      isMockMode: isMockMode(),
      // In production, would include deposit instructions
      instructions: isMockMode()
        ? {
            message: 'Demo mode: No actual transfer will be made',
            depositAddress: 'demo-deposit-address-' + transfer.id.slice(0, 8),
          }
        : undefined,
    });
  } catch (error) {
    console.error('Transfer creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transfer' },
      { status: 500 }
    );
  }
}

// GET /api/offramp/transfer?id=xxx - Get transfer status
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get('id');

    if (!transferId) {
      return NextResponse.json({ error: 'Transfer ID is required' }, { status: 400 });
    }

    const transfer = await getTransferStatus(transferId);

    return NextResponse.json({
      transfer,
      isMockMode: isMockMode(),
    });
  } catch (error) {
    console.error('Transfer status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get transfer status' },
      { status: 500 }
    );
  }
}
