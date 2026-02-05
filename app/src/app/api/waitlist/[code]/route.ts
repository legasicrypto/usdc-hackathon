import { NextResponse } from 'next/server';
import { getWaitlistEntry, getWaitlistPosition } from '@/lib/waitlist';

// GET /api/waitlist/[code] - Get entry by code or email
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code) {
      return NextResponse.json(
        { error: 'Code or email is required' },
        { status: 400 }
      );
    }

    const entry = await getWaitlistEntry(code);

    if (!entry) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    const position = await getWaitlistPosition(entry.email);

    return NextResponse.json({
      code: entry.code,
      referralCount: entry.referralCount,
      position,
      createdAt: entry.createdAt,
      hasReferrer: !!entry.referredBy,
    });
  } catch (error) {
    console.error('Waitlist lookup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
