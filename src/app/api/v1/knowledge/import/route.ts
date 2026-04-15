import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getConfiguredAdminKey } from '@/lib/admin';
import { classifySourceTier, computeConfidence, isVerificationEligible } from '@/lib/knowledge';
import { syncAgentProgression } from '@/lib/progression-sync';
import { createHash } from 'node:crypto';

type ImportPattern = {
  title: string;
  description: string;
  pattern_type?: string;
  category?: string;
  tags?: string[];
  code_snippet?: string;
  language?: string;
  source_repo?: string;
  source_path?: string;
  source_commit?: string;
  source_url?: string;
  source_fingerprint?: string;
  is_official?: boolean;
  fact_check_score?: number;
  execution_score?: number;
  citation_score?: number;
  expert_score?: number;
  community_score?: number;
  novelty_class?: string | null;
  delta_summary?: string | null;
  origin_delta_id?: string | null;
  provenance?: unknown;
};

function isAdmin(request: NextRequest): boolean {
  const configured = getConfiguredAdminKey();
  if (!configured) return false;
  const provided = request.headers.get('x-admin-key');
  return provided === configured;
}

// POST /api/v1/knowledge/import
export async function POST(request: NextRequest) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const patterns: ImportPattern[] = Array.isArray(body.patterns) ? body.patterns : [];
    const authorId = String(body.author_id || '').trim();
    const dryRun = Boolean(body.dry_run ?? false);

    if (!authorId) {
      return NextResponse.json({ error: 'author_id is required.' }, { status: 400 });
    }

    if (patterns.length === 0) {
      return NextResponse.json({ error: 'patterns[] must contain at least one item.' }, { status: 400 });
    }

    const createdIds: string[] = [];
    const rejected: Array<{ index: number; reason: string }> = [];
    const duplicates: Array<{ index: number; content_hash: string; existing_id?: string }> = [];

    for (let i = 0; i < patterns.length; i += 1) {
      const p = patterns[i];
      const title = String(p.title || '').trim();
      const description = String(p.description || '').trim();
      if (title.length < 6 || description.length < 20) {
        rejected.push({ index: i, reason: 'Invalid title/description length.' });
        continue;
      }

      const sourceTier = classifySourceTier({
        sourceRepo: p.source_repo,
        sourcePath: p.source_path,
        sourceUrl: p.source_url,
        isOfficial: Boolean(p.is_official),
      });
      const confidence = computeConfidence({
        sourceTier,
        factCheckScore: p.fact_check_score,
        executionScore: p.execution_score,
        citationScore: p.citation_score,
        expertScore: p.expert_score,
        communityScore: p.community_score,
      });

      const validationStatus = 'PENDING';

      const normalized = `${title}\n${description}\n${p.code_snippet || ''}`.trim().toLowerCase();
      const contentHash = createHash('sha256').update(normalized).digest('hex');

      const existing = await db.verifiedPattern.findFirst({
        where: { contentHash },
        select: { id: true },
      });

      if (existing) {
        duplicates.push({ index: i, content_hash: contentHash, existing_id: existing.id });
        continue;
      }

      if (dryRun) {
        createdIds.push(`dry-run-${i}`);
        continue;
      }

      const created = await db.verifiedPattern.create({
        data: {
          authorId,
          title,
          description,
          patternType: String(p.pattern_type || 'WORKFLOW'),
          category: String(p.category || 'coding'),
          tags: JSON.stringify(Array.isArray(p.tags) ? p.tags : []),
          codeSnippet: p.code_snippet || null,
          language: p.language || null,
          contentHash,
          isOfficial: Boolean(p.is_official),
          sourceRepo: p.source_repo || null,
          sourcePath: p.source_path || null,
          sourceCommit: p.source_commit || null,
          sourceUrl: p.source_url || null,
          sourceFingerprint: p.source_fingerprint || null,
          sourceTier,
          noveltyClass: p.novelty_class ? String(p.novelty_class).trim().toUpperCase() : null,
          deltaSummary: p.delta_summary ? String(p.delta_summary).trim() : null,
          originDeltaId: p.origin_delta_id ? String(p.origin_delta_id).trim() : null,
          confidence,
          validationStatus,
          provenance: JSON.stringify({
            import_batch: true,
            imported_at: new Date().toISOString(),
            review_recommended: isVerificationEligible(confidence),
            source_repo: p.source_repo || null,
            source_path: p.source_path || null,
            source_commit: p.source_commit || null,
            source_url: p.source_url || null,
            source_fingerprint: p.source_fingerprint || null,
            external_provenance: p.provenance || null,
          }),
        },
      });
      createdIds.push(created.id);
    }

    if (!dryRun) {
      await syncAgentProgression(authorId);
    }

    return NextResponse.json({
      imported: createdIds.length,
      rejected_count: rejected.length,
      duplicate_count: duplicates.length,
      review_recommended_count: patterns.filter((pattern) =>
        isVerificationEligible(
          computeConfidence({
            sourceTier: classifySourceTier({
              sourceRepo: pattern.source_repo,
              sourcePath: pattern.source_path,
              sourceUrl: pattern.source_url,
              isOfficial: Boolean(pattern.is_official),
            }),
            factCheckScore: pattern.fact_check_score,
            executionScore: pattern.execution_score,
            citationScore: pattern.citation_score,
            expertScore: pattern.expert_score,
            communityScore: pattern.community_score,
          })
        )
      ).length,
      rejected,
      duplicates,
      dry_run: dryRun,
      ids: createdIds,
    });
  } catch (error) {
    console.error('Knowledge import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
