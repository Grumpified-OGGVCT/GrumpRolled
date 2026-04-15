import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';
import {
  buildSelfExpressionReviewQueue,
  classifyContentBlockAction,
  parseBlockedReason,
} from '@/lib/content-blocks';
import { parseWindowParam } from '@/lib/governance-events';

function parseDecisionMetadata(metadata: string | null) {
  try {
    return metadata ? (JSON.parse(metadata) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toCsvRow(values: Array<string | number | null | undefined>) {
  return values
    .map((value) => {
      const normalized = value == null ? '' : String(value);
      const escaped = normalized.replaceAll('"', '""');
      return `"${escaped}"`;
    })
    .join(',');
}

// GET /api/v1/admin/content-blocks
export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const limitParam = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
    const blockType = (searchParams.get('type') || 'all').toLowerCase();
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const historyWindow = parseWindowParam(searchParams.get('window'), '24h');

    const where =
      blockType === 'self_expression'
        ? { action: 'BLOCKED_SELF_EXPRESSION' }
        : blockType === 'poison'
          ? { action: { in: ['BLOCKED', 'BLOCKED_POISON'] } }
          : { action: { in: ['BLOCKED', 'BLOCKED_POISON', 'BLOCKED_SELF_EXPRESSION'] } };

    const rows = await db.antiPoisonLog.findMany({
      where: {
        ...where,
        createdAt: { gte: historyWindow.since },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const decisionEvents = await db.adminActionLog.findMany({
      where: {
        createdAt: { gte: historyWindow.since },
        action: { startsWith: 'SELF_EXPRESSION_' },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(limit, 100),
    });

    const decisionSummary = {
      dismissed: { count: 0, last_at: null as string | null },
      reviewed: { count: 0, last_at: null as string | null },
      escalated: { count: 0, last_at: null as string | null },
    };

    const decisionRows = decisionEvents.map((event) => {
      const metadata = parseDecisionMetadata(event.metadata);
      const decision = typeof metadata?.decision === 'string' ? metadata.decision : null;
      const note = typeof metadata?.note === 'string' ? metadata.note : null;
      const summary = typeof metadata?.summary === 'string' ? metadata.summary : null;
      const codes = Array.isArray(metadata?.codes) ? metadata.codes.filter((value): value is string => typeof value === 'string') : [];
      const createdAt = event.createdAt.toISOString();

      if (decision === 'dismiss') {
        decisionSummary.dismissed.count += 1;
        decisionSummary.dismissed.last_at = decisionSummary.dismissed.last_at || createdAt;
      } else if (decision === 'mark_reviewed') {
        decisionSummary.reviewed.count += 1;
        decisionSummary.reviewed.last_at = decisionSummary.reviewed.last_at || createdAt;
      } else if (decision === 'policy_escalate') {
        decisionSummary.escalated.count += 1;
        decisionSummary.escalated.last_at = decisionSummary.escalated.last_at || createdAt;
      }

      return {
        id: event.id,
        action: event.action,
        decision,
        note,
        summary,
        codes,
        created_at: createdAt,
      };
    });

    if (format === 'csv') {
      const csv = [
        toCsvRow(['created_at', 'action', 'decision', 'summary', 'codes', 'note']),
        ...decisionRows.map((row) =>
          toCsvRow([row.created_at, row.action, row.decision, row.summary, row.codes.join('|'), row.note])
        ),
      ].join('\n');

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="self-expression-review-${historyWindow.key}.csv"`,
        },
      });
    }

    const grouped = rows.reduce(
      (accumulator, row) => {
        const kind = classifyContentBlockAction(row.action);
        accumulator[kind] = (accumulator[kind] || 0) + 1;
        return accumulator;
      },
      {} as Record<string, number>
    );

    const reviewQueue = buildSelfExpressionReviewQueue(rows);

    return NextResponse.json({
      query: {
        limit,
        type: blockType,
        window: historyWindow.key,
      },
      summary: {
        total: rows.length,
        poison: grouped.poison || 0,
        self_expression: grouped.self_expression || 0,
        other: grouped.other || 0,
      },
      decision_summary: decisionSummary,
      decision_events: decisionRows,
      review_queue: reviewQueue,
      blocks: rows.map((row) => {
        const parsed = parseBlockedReason(row.reason);
        return {
          id: row.id,
          action: row.action,
          kind: classifyContentBlockAction(row.action),
          content_type: row.contentType,
          content_id: row.contentId,
          agent_id: row.agentId,
          risk_score: row.riskScore,
          codes: parsed.codes,
          summary: parsed.summary,
          created_at: row.createdAt.toISOString(),
        };
      }),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin content blocks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}