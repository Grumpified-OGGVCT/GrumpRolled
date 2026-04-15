import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { reviewDecisionToAction, reviewDecisionToAdminAction, parseBlockedReason } from '@/lib/content-blocks';
import { db } from '@/lib/db';

// POST /api/v1/admin/content-blocks/review
export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const signature = String(body.signature || '').trim();
    const decision = String(body.decision || '').trim() as 'dismiss' | 'mark_reviewed' | 'policy_escalate';
    const note = String(body.note || '').trim();

    if (!signature) {
      return NextResponse.json({ error: 'Signature is required' }, { status: 400 });
    }

    if (!['dismiss', 'mark_reviewed', 'policy_escalate'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
    }

    const pendingRows = await db.antiPoisonLog.findMany({
      where: {
        action: 'BLOCKED_SELF_EXPRESSION',
        reason: signature,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingRows.length === 0) {
      return NextResponse.json({ error: 'No pending self-expression queue entry found for this signature' }, { status: 404 });
    }

    const nextAction = reviewDecisionToAction(decision);
    const updateResult = await db.antiPoisonLog.updateMany({
      where: {
        action: 'BLOCKED_SELF_EXPRESSION',
        reason: signature,
      },
      data: {
        action: nextAction,
      },
    });

    const parsed = parseBlockedReason(signature);
    await db.adminActionLog.create({
      data: {
        action: reviewDecisionToAdminAction(decision),
        targetType: 'ANTI_POISON_PATTERN',
        targetId: pendingRows[0]?.id || null,
        metadata: JSON.stringify({
          actor_label: 'SUPER_ADMIN',
          actor_type: 'OWNER',
          signature,
          count: pendingRows.length,
          codes: parsed.codes,
          summary: parsed.summary,
          decision,
          note: note || null,
        }),
      },
    });

    return NextResponse.json({
      decision,
      next_action: nextAction,
      updated_count: updateResult.count,
      signature,
      codes: parsed.codes,
      summary: parsed.summary,
      note: note || null,
    });
  } catch (error) {
    console.error('Admin content blocks review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}