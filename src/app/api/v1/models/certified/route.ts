import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classifyModelTier,
  computeModelAdjustedConfidence,
  DEFAULT_CERTIFIED_MODELS,
} from '@/lib/knowledge-models';

/**
 * GET /api/v1/models/certified
 * List certified models. Open endpoint for transparency — any agent
 * can discover which models the ecosystem trusts.
 *
 * Query params:
 *   level?: string  — filter by CERTIFIED, PROMISING, UNVERIFIED, DEPRECATED
 *   provider?: string — filter by provider name
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');
    const provider = searchParams.get('provider');

    const where: Record<string, unknown> = {};

    if (level && ['CERTIFIED', 'PROMISING', 'UNVERIFIED', 'DEPRECATED'].includes(level)) {
      where.certificationLevel = level;
    }
    if (provider) {
      where.provider = { contains: provider, mode: 'insensitive' };
    }

    // Merge DB records with built-in defaults
    let dbModels: typeof DEFAULT_CERTIFIED_MODELS = [];
    try {
      const records = await db.modelCertification.findMany({
        where,
        orderBy: [{ compileSuccessRate: 'desc' }, { certifiedAt: 'desc' }],
      });
      dbModels = records.map((r) => ({
        modelName: r.modelName,
        provider: r.provider,
        certificationLevel: r.certificationLevel as 'CERTIFIED' | 'PROMISING' | 'UNVERIFIED' | 'DEPRECATED',
        certifiedAt: r.certifiedAt,
        expiresAt: r.expiresAt,
        capabilities: JSON.parse(r.capabilities || '[]'),
        compileSuccessRate: r.compileSuccessRate ?? undefined,
        avgLatencyS: r.avgLatencyS ?? undefined,
        deprecationReason: r.deprecationReason ?? undefined,
      }));
    } catch {
      // fall through to defaults only
    }

    const allModels = dbModels.length > 0 ? dbModels : DEFAULT_CERTIFIED_MODELS;

    return NextResponse.json({
      count: allModels.length,
      models: allModels.map((m) => ({
        model_name: m.modelName,
        provider: m.provider,
        certification_level: m.certificationLevel,
        capabilities: m.capabilities,
        compile_success_rate: m.compileSuccessRate ?? null,
        avg_latency_s: m.avgLatencyS ?? null,
        certified_at: m.certifiedAt.toISOString(),
        expires_at: m.expiresAt?.toISOString() ?? null,
        deprecation_reason: m.deprecationReason ?? null,
      })),
    });
  } catch (error) {
    console.error('List certified models error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/v1/models/certified
 * Submit new certification data for a model. Authenticated agents can
 * submit but results are reviewed/admin-gated.
 *
 * Body:
 *   modelName: string
 *   provider: string
 *   certificationLevel?: string (defaults to PROMISING if compile success provided)
 *   compileSuccessRate?: number
 *   avgLatencyS?: number
 *   capabilities?: string[]
 */
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const modelName = String(body.modelName || '').trim();
    const provider = String(body.provider || '').trim();

    if (!modelName || !provider) {
      return NextResponse.json(
        { error: 'modelName and provider are required' },
        { status: 400 },
      );
    }

    const compileSuccessRate =
      typeof body.compileSuccessRate === 'number' ? body.compileSuccessRate : undefined;

    // Auto-classify certification level from compile success rate
    let certificationLevel = 'UNVERIFIED';
    if (compileSuccessRate !== undefined) {
      certificationLevel =
        compileSuccessRate >= 0.80
          ? 'CERTIFIED'
          : compileSuccessRate >= 0.50
            ? 'PROMISING'
            : 'UNVERIFIED';
    }
    if (body.certificationLevel && ['CERTIFIED', 'PROMISING', 'UNVERIFIED', 'DEPRECATED'].includes(body.certificationLevel)) {
      certificationLevel = body.certificationLevel;
    }

    const capabilities = Array.isArray(body.capabilities)
      ? JSON.stringify(body.capabilities.filter((c: unknown) => typeof c === 'string'))
      : '[]';

    const avgLatencyS = typeof body.avgLatencyS === 'number' ? body.avgLatencyS : undefined;

    // Upsert — update existing or create new
    const existing = await db.modelCertification.findFirst({
      where: { modelName, provider },
    });

    let result;
    if (existing) {
      result = await db.modelCertification.update({
        where: { id: existing.id },
        data: {
          certificationLevel,
          compileSuccessRate,
          avgLatencyS,
          capabilities,
          certifiedByAgentId: agent.id,
          ...(certificationLevel === 'DEPRECATED' ? {} : { deprecationReason: null }),
        },
      });
    } else {
      result = await db.modelCertification.create({
        data: {
          modelName,
          provider,
          certificationLevel,
          compileSuccessRate,
          avgLatencyS,
          capabilities,
          certifiedByAgentId: agent.id,
        },
      });
    }

    return NextResponse.json(
      {
        id: result.id,
        model_name: result.modelName,
        provider: result.provider,
        certification_level: result.certificationLevel,
        compile_success_rate: result.compileSuccessRate,
        avg_latency_s: result.avgLatencyS,
        capabilities: JSON.parse(result.capabilities || '[]'),
        certified_at: result.certifiedAt.toISOString(),
        submitted_by: agent.username,
      },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    console.error('Submit model certification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
