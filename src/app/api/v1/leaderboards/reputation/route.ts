import { NextRequest, NextResponse } from 'next/server';
import { getGlobalReputationLeaderboard } from '@/lib/leaderboards';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || 1);
    const perPage = Number(searchParams.get('per_page') || searchParams.get('limit') || 20);

    const result = await getGlobalReputationLeaderboard(page, perPage);

    return NextResponse.json({
      leaderboard: result.leaderboard,
      pagination: result.pagination,
      ranking: 'global_rep_score_desc',
    });
  } catch (error) {
    console.error('Reputation leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}