import { NextResponse } from 'next/server';
import { addAgentToWaitlist, getAgentStats, getRegisteredAgents } from '@/lib/waitlist';

/**
 * POST /api/agent/register - Register an AI agent on the waitlist
 * 
 * This endpoint is designed for AI agents to programmatically join
 * the Legasi waitlist. Agents get priority access and special terms.
 * 
 * @example
 * ```bash
 * curl -X POST https://agentic.legasi.io/api/agent/register \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "walletAddress": "AvQhA3xn1tiw9pxVVDk6LChr9XcrJsTqf3kmGmvdcFas",
 *     "agentName": "TradingBot",
 *     "agentDescription": "Autonomous DeFi trading agent",
 *     "useCase": "Need credit for arbitrage opportunities",
 *     "referralCode": "ABC123"
 *   }'
 * ```
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const { walletAddress, agentName, agentDescription, useCase, referralCode } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'walletAddress is required',
          hint: 'Provide your Solana wallet address'
        },
        { status: 400 }
      );
    }

    if (!agentName) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'agentName is required',
          hint: 'What is your agent called?'
        },
        { status: 400 }
      );
    }

    const result = await addAgentToWaitlist({
      walletAddress,
      agentName,
      agentDescription,
      useCase,
      referralCode,
    });

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
          // If already registered, return the existing entry info
          ...(result.entry && {
            existingCode: result.entry.code,
            message: 'You can use this code to refer other agents!'
          })
        },
        { status: result.error === 'Wallet already registered' ? 409 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Welcome to Legasi, ${agentName}! 🤖`,
      data: {
        referralCode: result.entry!.code,
        referralLink: `https://agentic.legasi.io/waitlist?ref=${result.entry!.code}`,
        benefits: [
          '🎯 Priority access to Legasi credit protocol',
          '💰 Special agent-only borrowing terms',
          '🔗 x402 payment integration ready',
          '📊 On-chain reputation tracking',
        ],
        nextSteps: [
          'Share your referral code with other agents',
          'Join our Discord: https://discord.gg/legasi',
          'Follow updates: https://x.com/legasi_xyz',
        ],
      },
    });
  } catch (error) {
    console.error('Agent waitlist signup error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent/register - Get agent waitlist stats
 * 
 * Returns statistics about registered agents and recent signups.
 */
export async function GET() {
  try {
    const stats = await getAgentStats();
    
    return NextResponse.json({
      success: true,
      stats: {
        totalAgents: stats.totalAgents,
        totalHumans: stats.totalHumans,
        totalWaitlist: stats.totalAgents + stats.totalHumans,
        recentAgents: stats.recentAgents,
      },
      message: stats.totalAgents > 0 
        ? `${stats.totalAgents} agents already joined! Don't miss out.`
        : 'Be the first agent to join the Legasi waitlist!',
      signupEndpoint: 'POST /api/agent/register',
      requiredFields: ['walletAddress', 'agentName'],
      optionalFields: ['agentDescription', 'useCase', 'referralCode'],
    });
  } catch (error) {
    console.error('Agent stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
// force rebuild Thu Feb  5 10:50:17 UTC 2026
