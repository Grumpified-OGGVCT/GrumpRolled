import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentRequest } from '@/lib/auth';
import {
  generateModelProvenanceReport,
  generateAllModelProvenanceReports,
  modelRegistry,
  seedModelRegistry,
  DEFAULT_CERTIFIED_MODELS,
} from '@/lib/knowledge-models';
import { db } from '@/lib/db';

// Seed on first import
seedModelRegistry(DEFAULT_CERTIFIED_MODELS);

/**
 * GET /api/v1/models/provenance
 * Generate a provenance report: which models contributed which patterns,
 * and with what confidence adjustment.
 *
 * Query params:
 *   modelName?: string  — filter by model name (returns single report)
 *   all?: string        — "true" returns all models' reports
 */
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get('modelName');
    const all = searchParams.get('all') === 'true';

    // Sync DB certifications into the in-memory registry
    try {
      const dbCerts = await db.modelCertification.findMany();
      const merged = [
        ...DEFAULT_CERTIFIED_MODELS,
        ...dbCerts.map((c) => ({
          modelName: c.modelName,
          provider: c.provider,
          certificationLevel: c.certificationLevel as 'CERTIFIED' | 'PROMISING' | 'UNVERIFIED' | 'DEPRECATED',
          certifiedAt: c.certifiedAt,
          expiresAt: c.expiresAt,
          capabilities: JSON.parse(c.capabilities || '[]'),
          compileSuccessRate: c.compileSuccessRate ?? undefined,
          avgLatencyS: c.avgLatencyS ?? undefined,
          deprecationReason: c.deprecationReason ?? undefined,
        })),
      ];
      seedModelRegistry(merged);
    } catch {
      // fall through with defaults
    }

    if (modelName) {
      const report = generateModelProvenanceReport(modelName);
      if (!report) {
        return NextResponse.json({ error: 'Model not found in registry' }, { status: 404 });
      }
      return NextResponse.json(report);
    }

    if (all) {
      const reports = generateAllModelProvenanceReports();
      return NextResponse.json({
        generated_at: new Date().toISOString(),
        count: reports.length,
        reports,
      });
    }

    // Default: return summary of all models
    const reports = generateAllModelProvenanceReports();
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      generated_by: agent.username,
      total_models: modelRegistry.size,
      reports,
    });
  } catch (error) {
    console.error('Model provenance report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
