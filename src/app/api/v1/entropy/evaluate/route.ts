import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { decompile, similarityGate, type EntropyAnchorResult } from '@/lib/entropy-anchor';
import { db } from '@/lib/db';

/**
 * POST /api/v1/entropy/evaluate
 * Run the entropy anchor: decompile → similarity gate → drift report.
 *
 * Body:
 *   intent: string          — the declared intent / source
 *   ast: AstProgram         — the AST program to decompile
 *   expectedIntent?: string — expected human-readable intent
 *   threshold?: number      — override default threshold
 *   policyMode?: string     — advisory | enforce | high_risk_enforce
 *   patternId?: string      — link to an existing pattern for history
 */
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const source = String(body.intent || '').trim();
    const ast = body.ast;
    const expectedIntent = body.expectedIntent ? String(body.expectedIntent) : '';
    const threshold = typeof body.threshold === 'number' ? body.threshold : undefined;
    const policyMode =
      ['advisory', 'enforce', 'high_risk_enforce'].includes(body.policyMode)
        ? (body.policyMode as 'advisory' | 'enforce' | 'high_risk_enforce')
        : 'advisory';
    const patternId = body.patternId ? String(body.patternId) : null;

    if (!source) {
      return NextResponse.json({ error: 'intent is required' }, { status: 400 });
    }

    if (!ast) {
      return NextResponse.json({ error: 'ast is required' }, { status: 400 });
    }

    // Dynamically import evaluateEntropyAnchor to use the full pipeline
    const { evaluateEntropyAnchor } = await import('@/lib/entropy-anchor');
    const result: EntropyAnchorResult = evaluateEntropyAnchor(
      source,
      ast,
      expectedIntent,
      threshold,
      policyMode,
    );

    // Persist snapshot for historical drift tracking
    try {
      await db.entropyAnchorSnapshot.create({
        data: {
          patternId,
          intentText: source,
          decompiledText: result.translationSummary,
          similarityScore: result.similarityScore,
          threshold: result.threshold,
          policyMode,
          passed: !result.driftDetected,
        },
      });
    } catch {
      // non-blocking
    }

    return NextResponse.json(
      {
        passed: !result.driftDetected,
        similarity: result.similarityScore,
        threshold: result.threshold,
        policy_mode: policyMode,
        decompiled: result.translationSummary,
        drift_detected: result.driftDetected,
        action: !result.driftDetected
          ? 'no_action'
          : policyMode === 'high_risk_enforce'
            ? 'halted'
            : policyMode === 'enforce'
              ? 'human_review_required'
              : 'warning',
      },
      {
        status: !result.driftDetected ? 200 : policyMode === 'high_risk_enforce' ? 403 : 200,
      },
    );
  } catch (error) {
    console.error('Entropy anchor error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
