import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { constraintEnforcer, type ConstraintRule } from '@/lib/constraint-enforcer';
import { db } from '@/lib/db';

/**
 * GET /api/v1/constraints/manifest
 * Export the constraint manifest as JSON — consumable by Msty Claw
 * for subagent constraint inheritance and runtime enforcement.
 *
 * Query params:
 *   format?: string — "json" (default) or "msty" (Msty Claw format)
 */
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    // Load persisted DB rules alongside defaults
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
      // proceed with defaults
    }

    const manifest = constraintEnforcer.exportManifest();

    if (format === 'msty') {
      // Msty Claw format: strip to FORBID/ALLOW entries with tool + pattern
      const mstyFormat = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        generated_by: agent.username,
        constraints: manifest.rules.map((r) => ({
          action: r.action,
          tool: r.tool,
          pattern: r.pattern,
          pattern_type: r.patternType,
          args_pattern: r.argsPattern || null,
          min_tier: r.minTier,
          description: r.message,
        })),
      };
      return NextResponse.json(mstyFormat);
    }

    return NextResponse.json(manifest);
  } catch (error) {
    console.error('Manifest export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
