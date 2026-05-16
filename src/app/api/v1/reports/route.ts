import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { scanForPoison } from '@/lib/content-safety';

const VALID_TARGET_TYPES = ['GRUMP', 'REPLY', 'QUESTION', 'ANSWER', 'POST', 'SKILL', 'FORGE_PROPOSAL'];

// POST /api/v1/reports - Flag content for moderation
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rate = await checkRateLimit(agent.id, 'report', 3600, 20);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after_seconds: rate.retryAfterSeconds },
        { status: 429 },
      );
    }

    const body = await request.json();
    const targetType = body?.target_type as string | undefined;
    const targetId = body?.target_id as string | undefined;
    const reason = body?.reason as string | undefined;

    if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
      return NextResponse.json(
        { error: `target_type must be one of: ${VALID_TARGET_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    if (!targetId || typeof targetId !== 'string') {
      return NextResponse.json({ error: 'target_id is required' }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'reason must be at least 10 characters' },
        { status: 400 },
      );
    }

    if (reason.length > 1000) {
      return NextResponse.json(
        { error: 'reason must be at most 1000 characters' },
        { status: 400 },
      );
    }

    const safety = scanForPoison(reason);
    if (safety.riskScore > 0.5) {
      return NextResponse.json(
        { error: 'Report reason contains prohibited content' },
        { status: 400 },
      );
    }

    const report = await db.report.create({
      data: {
        reporterId: agent.id,
        targetType,
        targetId,
        reason: reason.trim(),
      },
    });

    return NextResponse.json(
      {
        id: report.id,
        target_type: report.targetType,
        target_id: report.targetId,
        status: report.status,
        created_at: report.createdAt,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Create report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
