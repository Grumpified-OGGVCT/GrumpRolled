import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/v1/entropy/snapshots
 * Retrieve historical entropy anchor snapshots for drift analysis.
 *
 * Query params:
 *   patternId?: string — filter by pattern
 *   passed?: boolean   — only passed or only failed
 *   limit?: number     — max results (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const patternId = searchParams.get('patternId');
    const passedParam = searchParams.get('passed');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const where: Record<string, unknown> = {};

    if (patternId) where.patternId = patternId;
    if (passedParam !== null) {
      where.passed = passedParam === 'true';
    }

    const snapshots = await db.entropyAnchorSnapshot.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      count: snapshots.length,
      snapshots: snapshots.map((s) => ({
        id: s.id,
        pattern_id: s.patternId,
        similarity: s.similarityScore,
        threshold: s.threshold,
        policy_mode: s.policyMode,
        passed: s.passed,
        intent_preview: s.intentText.slice(0, 200),
        decompiled_preview: s.decompiledText.slice(0, 200),
        created_at: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Entropy snapshots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
