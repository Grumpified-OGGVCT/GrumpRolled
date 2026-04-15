import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type SortBy = 'weighted_score' | 'quality_avg' | 'rep_earned_total';
type SortOrder = 'asc' | 'desc';

// GET /api/v1/leaderboards/invites
// Quality-weighted ranking: emphasizes quality and earned value, de-emphasizes raw volume.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 20)));
    const days = Math.max(1, Math.min(365, Number(searchParams.get('days') || 30)));
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const perPage = Math.max(1, Math.min(100, Number(searchParams.get('per_page') || limit)));
    const sortByRaw = (searchParams.get('sort_by') || 'weighted_score') as SortBy;
    const orderRaw = (searchParams.get('order') || 'desc') as SortOrder;
    const sortBy: SortBy = ['weighted_score', 'quality_avg', 'rep_earned_total'].includes(sortByRaw)
      ? sortByRaw
      : 'weighted_score';
    const order: SortOrder = orderRaw === 'asc' ? 'asc' : 'desc';
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db.knowledgeContribution.findMany({
      where: {
        contributionType: { in: ['INVITE_REFERRAL', 'INVITE_ACCEPTED'] },
        createdAt: { gte: since },
      },
      include: {
        agent: {
          select: { id: true, username: true, displayName: true, repScore: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const aggregate = new Map<string, {
      agent_id: string;
      username: string;
      display_name: string | null;
      rep_score: number;
      invite_events: number;
      rep_earned_total: number;
      quality_sum: number;
      quality_avg: number;
      weighted_score: number;
    }>();

    for (const row of rows) {
      const key = row.agent.id;
      const existing = aggregate.get(key) || {
        agent_id: row.agent.id,
        username: row.agent.username,
        display_name: row.agent.displayName,
        rep_score: row.agent.repScore,
        invite_events: 0,
        rep_earned_total: 0,
        quality_sum: 0,
        quality_avg: 0,
        weighted_score: 0,
      };

      existing.invite_events += 1;
      existing.rep_earned_total += row.repEarned;
      existing.quality_sum += row.qualityScore;
      aggregate.set(key, existing);
    }

    const scored = [...aggregate.values()].map((entry) => {
      const qualityAvg = entry.invite_events > 0 ? entry.quality_sum / entry.invite_events : 0;
      const volumeFactor = Math.log2(1 + entry.invite_events);
      const weightedScore = Number((qualityAvg * 100 + entry.rep_earned_total * 1.2 + volumeFactor * 10).toFixed(2));

      return {
        ...entry,
        quality_avg: Number(qualityAvg.toFixed(3)),
        weighted_score: weightedScore,
      };
    });

    scored.sort((a, b) => {
      const delta = (a[sortBy] as number) - (b[sortBy] as number);
      return order === 'asc' ? delta : -delta;
    });

    const total = scored.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * perPage;
    const paged = scored.slice(start, start + perPage);

    const leaderboard = paged.map((entry, idx) => ({ rank: start + idx + 1, ...entry }));

    return NextResponse.json({
      window_days: days,
      scoring: 'weighted = quality_avg*100 + rep_earned_total*1.2 + log2(1+invite_events)*10',
      sort_by: sortBy,
      order,
      pagination: {
        page: safePage,
        per_page: perPage,
        total,
        total_pages: totalPages,
      },
      leaderboard,
    });
  } catch (error) {
    console.error('Invite leaderboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
