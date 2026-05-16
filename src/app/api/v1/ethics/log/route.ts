import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredAdminKey } from '@/lib/admin';
import { db } from '@/lib/db';

function isAdmin(request: NextRequest): boolean {
  const configured = getConfiguredAdminKey();
  const provided = request.headers.get('x-admin-key');
  if (!configured) return false;
  return provided === configured;
}

/**
 * GET /api/v1/ethics/log
 * Query ethics audit logs. Admin only.
 *
 * Query params:
 *   agentId?: string    — filter by agent
 *   result?: string     — PASSED, BLOCKED, TERMINATED
 *   since?: string      — ISO-8601 timestamp
 *   limit?: number      — max results (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const pipelineResult = searchParams.get('result');
    const since = searchParams.get('since');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const where: Record<string, unknown> = {};

    if (agentId) where.agentId = agentId;
    if (pipelineResult && ['PASSED', 'BLOCKED', 'TERMINATED'].includes(pipelineResult)) {
      where.pipelineResult = pipelineResult;
    }
    if (since) {
      where.createdAt = { gte: new Date(since) };
    }

    const logs = await db.ethicsAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      count: logs.length,
      logs: logs.map((l) => ({
        id: l.id,
        agent_id: l.agentId,
        content_snippet: l.contentSnippet,
        pipeline_result: l.pipelineResult,
        violations: JSON.parse(l.violations || '[]'),
        articles_cited: l.articlesCited,
        review_duration_ms: l.reviewDurationMs,
        created_at: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Ethics log query error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
