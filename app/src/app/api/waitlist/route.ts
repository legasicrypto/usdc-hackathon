import { NextResponse } from 'next/server';
import {
  addToWaitlist,
  getWaitlistStats,
  getLeaderboard,
  isValidEmail,
} from '@/lib/waitlist';

// POST /api/waitlist - Add to waitlist
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, referralCode, walletAddress } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const result = await addToWaitlist(email, referralCode, walletAddress);

    if (!result.success) {
      // If already registered, return the existing entry
      if (result.error === 'Email already registered' && result.entry) {
        return NextResponse.json(
          {
            message: 'Already registered',
            entry: {
              code: result.entry.code,
              referralCount: result.entry.referralCount,
              createdAt: result.entry.createdAt,
            },
          },
          { status: 200 }
        );
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        message: 'Successfully joined waitlist!',
        entry: {
          code: result.entry!.code,
          referralCount: result.entry!.referralCount,
          createdAt: result.entry!.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Waitlist error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/waitlist - Get stats and leaderboard
export async function GET() {
  try {
    const stats = await getWaitlistStats();
    const leaderboard = await getLeaderboard(10);

    return NextResponse.json({
      stats,
      leaderboard,
    });
  } catch (error) {
    console.error('Waitlist stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
