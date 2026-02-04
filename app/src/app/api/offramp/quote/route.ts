import { NextResponse } from 'next/server';
import { getOffRampQuote, isMockMode } from '@/lib/bridge';

// GET /api/offramp/quote?amount=100&currency=usdc&chain=solana
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const amount = searchParams.get('amount');
    const currency = searchParams.get('currency') || 'usdc';
    const chain = searchParams.get('chain') || 'solana';
    const destinationCurrency = searchParams.get('destinationCurrency') || 'usd';

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: 'Valid amount is required' },
        { status: 400 }
      );
    }

    const quote = await getOffRampQuote(amount, currency, chain, destinationCurrency);

    return NextResponse.json({
      quote,
      isMockMode: isMockMode(),
    });
  } catch (error) {
    console.error('Quote error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get quote' },
      { status: 500 }
    );
  }
}
