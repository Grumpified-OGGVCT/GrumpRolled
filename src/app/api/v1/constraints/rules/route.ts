import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredAdminKey } from '@/lib/admin';
import { db } from '@/lib/db';
import { VALID_ACTIONS, VALID_TOOLS, type GovernanceTier } from '@/lib/constraint-enforcer';

function isAdmin(request: NextRequest): boolean {
  const configured = getConfiguredAdminKey();
  const provided = request.headers.get('x-admin-key');
  if (!configured) return false;
  return provided === configured;
}

/**
 * POST /api/v1/constraints/rules
 * Add a new constraint rule to the persisted database.
 * Admin-only endpoint. Rules are additive — they supplement the 40 defaults.
 *
 * Body:
 *   action: string       — FORBID, ALLOW, REQUIRE_APPROVAL
 *   tool: string         — shell, file_read, file_write, etc.
 *   pattern: string      — glob or regex pattern
 *   patternType?: string — glob | regex (default: glob)
 *   argsPattern?: string — refine match to specific args
 *   minTier?: string     — hearth | forge | sovereign (default: hearth)
 *   description: string  — human-readable rule description
 *   priority?: number    — higher = checked first (default: 0)
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    const action = String(body.action || 'FORBID').toUpperCase();
    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    const tool = String(body.tool || '').trim();
    if (!(VALID_TOOLS as readonly string[]).includes(tool)) {
      return NextResponse.json(
        { error: `Invalid tool. Must be one of: ${VALID_TOOLS.join(', ')}` },
        { status: 400 },
      );
    }

    const pattern = String(body.pattern || '').trim();
    if (!pattern) {
      return NextResponse.json({ error: 'pattern is required' }, { status: 400 });
    }

    const patternType =
      body.patternType === 'regex' ? 'regex' : 'glob';

    const argsPattern = body.argsPattern ? String(body.argsPattern) : null;

    const minTier: GovernanceTier = ['hearth', 'forge', 'sovereign'].includes(body.minTier)
      ? body.minTier
      : 'hearth';

    const description = String(body.description || '').trim();
    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const priority = typeof body.priority === 'number' ? body.priority : 0;

    const rule = await db.constraintRule.create({
      data: {
        action,
        tool,
        pattern,
        patternType,
        argsPattern,
        minTier,
        description,
        enabled: true,
        priority,
      },
    });

    return NextResponse.json(
      {
        id: rule.id,
        action: rule.action,
        tool: rule.tool,
        pattern: rule.pattern,
        pattern_type: rule.patternType,
        args_pattern: rule.argsPattern,
        min_tier: rule.minTier,
        description: rule.description,
        enabled: rule.enabled,
        priority: rule.priority,
        created_at: rule.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Add constraint rule error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/v1/constraints/rules
 * List all persisted constraint rules (admin only).
 */
export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includeDisabled = searchParams.get('include_disabled') === 'true';

    const where = includeDisabled ? {} : { enabled: true };

    const rules = await db.constraintRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      count: rules.length,
      rules: rules.map((r) => ({
        id: r.id,
        action: r.action,
        tool: r.tool,
        pattern: r.pattern,
        pattern_type: r.patternType,
        args_pattern: r.argsPattern,
        min_tier: r.minTier,
        description: r.description,
        enabled: r.enabled,
        priority: r.priority,
        created_at: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List constraint rules error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/constraints/rules
 * Toggle a rule's enabled status. Admin only.
 *
 * Body:
 *   id: string      — rule ID
 *   enabled: boolean — new enabled state
 */
export async function PATCH(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.constraintRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const updated = await db.constraintRule.update({
      where: { id },
      data: { enabled: Boolean(body.enabled) },
    });

    return NextResponse.json({
      id: updated.id,
      enabled: updated.enabled,
      description: updated.description,
    });
  } catch (error) {
    console.error('Patch constraint rule error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
