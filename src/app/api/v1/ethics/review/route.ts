import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { ethicalCheck, ARTICLES, type GovernorResult, type Violation } from '@/lib/ethical-governor';
import { db } from '@/lib/db';
import { createHash } from 'node:crypto';

/**
 * POST /api/v1/ethics/review
 * Run the full 4-layer ethics pipeline on submitted content.
 *
 * Body:
 *   content: string          — the content/text to review
 *   statements?: object[]    — optional: structured statements
 *   tier?: string            — hearth | forge | sovereign (default: hearth)
 *   redHatMetadata?: object  — optional: research pathway metadata
 *
 * Returns:
 *   passed: boolean
 *   blocks: string[]         — if blocked, which rules triggered
 *   warnings: string[]
 *   review_id: string        — persisted audit log ID
 */
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const content = String(body.content || '').trim();
    const statements: Array<Record<string, unknown>> =
      Array.isArray(body.statements) ? body.statements : [];
    const tier =
      ['hearth', 'forge', 'sovereign'].includes(body.tier) ? body.tier : 'hearth';
    const redHatMetadata: Record<string, unknown> | null =
      body.redHatMetadata && typeof body.redHatMetadata === 'object'
        ? body.redHatMetadata
        : null;

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    if (content.length > 50000) {
      return NextResponse.json({ error: 'Content exceeds 50,000 character limit' }, { status: 400 });
    }

    const contentHash = createHash('sha256').update(content).digest('hex');
    const startTime = Date.now();

    // Run the ethics pipeline
    const result: GovernorResult = ethicalCheck(content, statements, tier as 'hearth' | 'forge' | 'sovereign', redHatMetadata);
    const reviewDurationMs = Date.now() - startTime;

    const pipelineResult = result.passed ? 'PASSED' : 'BLOCKED';

    // Extract articles cited from audit log
    const articlesCited = result.auditLog
      .map((e) => e.article)
      .filter((a, i, arr) => arr.indexOf(a) === i);

    // Persist audit log
    let reviewId: string | null = null;
    try {
      const log = await db.ethicsAuditLog.create({
        data: {
          agentId: agent.id,
          contentSnippet: content.slice(0, 500),
          contentHash,
          pipelineResult,
          violations: JSON.stringify(result.blocks),
          articlesCited: articlesCited.join(','),
          reviewDurationMs,
        },
      });
      reviewId = log.id;
    } catch (dbError) {
      console.error('Ethics audit log persist error:', dbError);
    }

    return NextResponse.json(
      {
        passed: result.passed,
        blocks: result.blocks,
        warnings: result.warnings,
        articles_cited: articlesCited,
        review_id: reviewId,
        review_duration_ms: reviewDurationMs,
      },
      { status: result.passed ? 200 : 403 },
    );
  } catch (error) {
    console.error('Ethics review error:', error);
    return NextResponse.json(
      {
        passed: false,
        blocks: ['[ETHICS_INTERNAL_ERROR] Ethics governor internal error — content blocked (fails-closed)'],
        warnings: [],
        articles_cited: ['C-5'],
        review_id: null,
      },
      { status: 500 },
    );
  }
}
