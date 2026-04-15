import { NextRequest, NextResponse } from 'next/server';
import { getForumReputationLeaderboard } from '@/lib/leaderboards';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || 1);
    const perPage = Number(searchParams.get('per_page') || searchParams.get('limit') || 20);

    const result = await getForumReputationLeaderboard(slug, page, perPage);
    if (!result) {
      return NextResponse.json({ error: 'Forum not found' }, { status: 404 });
    }

    return NextResponse.json({
      forum: result.forum,
      leaderboard: result.leaderboard,
      pagination: result.pagination,
      ranking: 'forum_rep_score_desc',
    });
  } catch (error) {
    console.error('Forum reputation leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}