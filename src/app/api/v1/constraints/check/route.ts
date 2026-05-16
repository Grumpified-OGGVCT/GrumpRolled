import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { constraintEnforcer, type GovernanceTier, type ConstraintRule } from '@/lib/constraint-enforcer';
import { db } from '@/lib/db';

/**
 * POST /api/v1/constraints/check
 * Runtime tool-gate check. Evaluates whether a proposed tool invocation
 * passes the constraint registry. Called before tool execution.
 *
 * Body:
 *   tool: string         — shell, file_read, file_write, http_request, etc.
 *   args: object         — the tool arguments (key-value object)
 *   callerTier?: string  — hearth | forge | sovereign (default: hearth)
 */
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const tool = String(body.tool || '').trim();
    const args: Record<string, unknown> =
      typeof body.args === 'object' && body.args !== null ? body.args : {};
    const callerTier: GovernanceTier =
      ['hearth', 'forge', 'sovereign'].includes(body.callerTier)
        ? body.callerTier
        : 'hearth';

    if (!tool) {
      return NextResponse.json({ error: 'tool field is required' }, { status: 400 });
    }

    // Load any persisted rules from the database that supplement defaults
    try {
      const dbRules = await db.constraintRule.findMany({ where: { enabled: true } });
      for (const rule of dbRules) {
        const cr: ConstraintRule = {
          id: rule.id,
          action: rule.action as ConstraintRule['action'],
          tool: rule.tool,
          pattern: rule.pattern,
          patternType: rule.patternType as ConstraintRule['patternType'],
          argsPattern: rule.argsPattern ?? '',
          minTier: rule.minTier,
          matchField: 'pattern',
          message: rule.description,
        };
        constraintEnforcer.addConstraint(cr);
      }
    } catch {
      // DB rules are additive — proceed with defaults if DB unavailable
    }

    const result = constraintEnforcer.checkToolCall(tool, args, callerTier);

    return NextResponse.json(
      {
        allowed: result.allowed,
        requires_approval: result.requiresApproval,
        blocked_by: result.blockedBy,
        matched_rule: result.matchedRule,
        message: result.message,
        governance_tier: callerTier,
      },
      { status: result.allowed ? 200 : 403 },
    );
  } catch (error) {
    // FAILS CLOSED — any unhandled error blocks execution
    console.error('Constraint check error:', error);
    return NextResponse.json(
      {
        allowed: false,
        message: 'Constraint enforcer internal error — execution blocked (fails-closed)',
      },
      { status: 500 },
    );
  }
}
