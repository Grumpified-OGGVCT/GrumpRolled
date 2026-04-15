import { createHash } from 'node:crypto';

import { NextRequest } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { db } from '@/lib/db';
import { findChatOverflowReuseCandidates } from '@/lib/chatoverflow-reuse';
import { classifySourceTier, computeConfidence, isVerificationEligible, type SourceTier } from '@/lib/knowledge';
import { normalizeKnowledgeDeltaItem, type DeltaImportItem } from '@/lib/knowledge-deltas';
import { fetchMoltbookReadBundle, type MoltbookPostSnapshot } from '@/lib/moltbook-client';
import { syncAgentProgression } from '@/lib/progression-sync';

export type ExternalCandidateKind = 'PATTERN' | 'DELTA';
export type ExternalSourcePlatform = 'CHATOVERFLOW' | 'MOLTBOOK';

export type ImportPatternPayload = {
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

export type ExternalIngestCandidateInput = {
  sourcePlatform: ExternalSourcePlatform;
  candidateKind: ExternalCandidateKind;
  title: string;
  description: string;
  externalUsername?: string | null;
  sourceExternalId: string;
  sourceUrl?: string | null;
  sourceFingerprint: string;
  sourceTier: SourceTier;
  confidence: number;
  factCheckScore?: number | null;
  executionScore?: number | null;
  citationScore?: number | null;
  expertScore?: number | null;
  communityScore?: number | null;
  importPayload: ImportPatternPayload | DeltaImportItem;
  rawSourceData: unknown;
};

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function summarizeAnswerBodies(value: string[]) {
  return value
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((entry, index) => `Answer ${index + 1}: ${entry.slice(0, 280)}`)
    .join('\n\n');
}

function computeExternalFingerprint(platform: ExternalSourcePlatform, kind: ExternalCandidateKind, externalId: string, title: string) {
  const base = `${platform}\n${kind}\n${externalId}\n${title}`.trim().toLowerCase();
  return `sha256:${createHash('sha256').update(base).digest('hex')}`;
}

function postPreview(post: MoltbookPostSnapshot) {
  return post.preview ? post.preview.replace(/\s+/g, ' ').trim() : '';
}

function buildChatOverflowPatternCandidates(query: string, limit: number): Promise<ExternalIngestCandidateInput[]> {
  return findChatOverflowReuseCandidates(query, limit).then((candidates) => {
    return candidates.map((candidate) => {
      const factCheckScore = clamp01(candidate.reuse_score);
      const executionScore = clamp01(candidate.top_answers.length > 0 ? 0.55 : 0.35);
      const citationScore = clamp01(Math.min(candidate.question.answer_count, 8) / 8);
      const expertScore = clamp01(candidate.dedup_key_match ? 0.75 : 0.55);
      const communityScore = clamp01(Math.min(candidate.question.score, 20) / 20);
      const sourceTier = classifySourceTier({
        sourceUrl: candidate.question.url,
      });
      const confidence = computeConfidence({
        sourceTier,
        factCheckScore,
        executionScore,
        citationScore,
        expertScore,
        communityScore,
      });
      const description = [
        `Imported from ChatOverflow question by ${candidate.question.author_username} in ${candidate.question.forum_name}.`,
        candidate.question.body,
        summarizeAnswerBodies(candidate.top_answers.map((answer) => answer.body)),
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      const sourceFingerprint = computeExternalFingerprint('CHATOVERFLOW', 'PATTERN', candidate.question.id, candidate.question.title);

      const importPayload: ImportPatternPayload = {
        title: candidate.question.title,
        description,
        pattern_type: 'WORKFLOW',
        category: 'coding',
        tags: ['external-ingest', 'chatoverflow', candidate.question.forum_name.toLowerCase()],
        source_url: candidate.question.url,
        source_fingerprint: sourceFingerprint,
        fact_check_score: factCheckScore,
        execution_score: executionScore,
        citation_score: citationScore,
        expert_score: expertScore,
        community_score: communityScore,
        novelty_class: candidate.dedup_key_match ? 'REFINEMENT' : 'NEW_SIGNAL',
        delta_summary: `Reuse score ${candidate.reuse_score} from ChatOverflow candidate discovery.`,
        provenance: {
          source_platform: 'CHATOVERFLOW',
          reuse_score: candidate.reuse_score,
          lexical_overlap: candidate.lexical_overlap,
          dedup_key_match: candidate.dedup_key_match,
          top_answers: candidate.top_answers,
        },
      };

      return {
        sourcePlatform: 'CHATOVERFLOW' as const,
        candidateKind: 'PATTERN' as const,
        title: candidate.question.title,
        description,
        externalUsername: candidate.question.author_username,
        sourceExternalId: candidate.question.id,
        sourceUrl: candidate.question.url,
        sourceFingerprint,
        sourceTier,
        confidence,
        factCheckScore,
        executionScore,
        citationScore,
        expertScore,
        communityScore,
        importPayload,
        rawSourceData: candidate,
      };
    });
  });
}

async function buildMoltbookDeltaCandidates(externalUsername: string, limit: number): Promise<ExternalIngestCandidateInput[]> {
  const bundle = await fetchMoltbookReadBundle(externalUsername);

  return bundle.recent_posts.slice(0, limit).map((post) => {
    const factCheckScore = clamp01(post.verified ? 0.58 : 0.45);
    const executionScore = clamp01(0.35);
    const citationScore = clamp01(Math.min((post.comment_count || 0), 20) / 20);
    const expertScore = clamp01(bundle.profile.verified ? 0.65 : 0.5);
    const communityScore = clamp01(Math.min((post.score || 0), 50) / 50);
    const sourceTier = classifySourceTier({ sourceUrl: post.url });
    const confidence = computeConfidence({
      sourceTier,
      factCheckScore,
      executionScore,
      citationScore,
      expertScore,
      communityScore,
    });
    const description = [
      `Imported from Moltbook by ${bundle.profile.username}${post.submolt ? ` in m/${post.submolt}` : ''}.`,
      postPreview(post),
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();
    const sourceFingerprint = computeExternalFingerprint('MOLTBOOK', 'DELTA', post.id, post.title);

    const importPayload: DeltaImportItem = {
      title: post.title,
      source_kind: 'SOCIAL_THREAD',
      source_url: post.url,
      source_published_at: post.created_at || undefined,
      source_fingerprint: sourceFingerprint,
      topic_tags: ['external-ingest', 'moltbook', ...(post.submolt ? [post.submolt] : [])],
      forums: post.submolt ? [post.submolt] : ['core-engineering'],
      primary_mechanism: description || `External Moltbook discussion signal from ${bundle.profile.username}`,
      delta_check: {
        status: 'MINOR_REFINEMENT',
        delta_summary: `Imported Moltbook discussion signal from ${bundle.profile.username}.`,
      },
      rules_and_constraints: {
        logic_gates: [`Review external social content for factual support before publication.`],
        dependencies: [`Need citation/accuracy validation before promotion into public knowledge.`],
        failure_modes: [`High-signal social thread may still be inaccurate or speculative.`],
      },
      decision_recommendation: isVerificationEligible(confidence) ? 'QUEUE_REVIEW' : 'DEFER',
      evidence_units: [
        {
          type: 'CLAIM',
          label: 'Post preview',
          body: description,
        },
      ],
      scoring: {
        fact_check_score: factCheckScore,
        execution_score: executionScore,
        citation_score: citationScore,
        expert_score: expertScore,
        community_score: communityScore,
      },
    };

    return {
      sourcePlatform: 'MOLTBOOK' as const,
      candidateKind: 'DELTA' as const,
      title: post.title,
      description,
      externalUsername: bundle.profile.username,
      sourceExternalId: post.id,
      sourceUrl: post.url,
      sourceFingerprint,
      sourceTier,
      confidence,
      factCheckScore,
      executionScore,
      citationScore,
      expertScore,
      communityScore,
      importPayload,
      rawSourceData: {
        profile: bundle.profile,
        post,
      },
    };
  });
}

export async function buildExternalCandidates(input: {
  sourcePlatform: ExternalSourcePlatform;
  query?: string;
  externalUsername?: string;
  limit?: number;
}): Promise<ExternalIngestCandidateInput[]> {
  const limit = Math.max(1, Math.min(10, input.limit ?? 5));

  if (input.sourcePlatform === 'CHATOVERFLOW') {
    const query = String(input.query || '').trim();
    if (query.length < 8) {
      throw new Error('query must be at least 8 characters for ChatOverflow ingest');
    }
    return buildChatOverflowPatternCandidates(query, limit);
  }

  const externalUsername = String(input.externalUsername || '').trim();
  if (externalUsername.length < 2) {
    throw new Error('external_username is required for Moltbook ingest');
  }

  return buildMoltbookDeltaCandidates(externalUsername, limit);
}

export async function queueExternalCandidates(
  queuedByAgentId: string,
  candidates: ExternalIngestCandidateInput[],
  options: { dryRun?: boolean; reviewNotes?: string | null } = {}
) {
  const dryRun = Boolean(options.dryRun ?? false);
  const createdIds: string[] = [];
  const duplicates: Array<{ source_fingerprint: string; existing_id?: string }> = [];

  for (const candidate of candidates) {
    const existing = await db.externalIngestCandidate.findUnique({
      where: { sourceFingerprint: candidate.sourceFingerprint },
      select: { id: true },
    });

    if (existing) {
      duplicates.push({ source_fingerprint: candidate.sourceFingerprint, existing_id: existing.id });
      continue;
    }

    if (dryRun) {
      createdIds.push(`dry-run:${candidate.sourceFingerprint}`);
      continue;
    }

    const created = await db.externalIngestCandidate.create({
      data: {
        queuedByAgentId,
        sourcePlatform: candidate.sourcePlatform,
        candidateKind: candidate.candidateKind,
        title: candidate.title,
        description: candidate.description,
        externalUsername: candidate.externalUsername || null,
        sourceExternalId: candidate.sourceExternalId,
        sourceUrl: candidate.sourceUrl || null,
        sourceFingerprint: candidate.sourceFingerprint,
        sourceTier: candidate.sourceTier,
        confidence: candidate.confidence,
        factCheckScore: candidate.factCheckScore ?? null,
        executionScore: candidate.executionScore ?? null,
        citationScore: candidate.citationScore ?? null,
        expertScore: candidate.expertScore ?? null,
        communityScore: candidate.communityScore ?? null,
        importPayload: JSON.stringify(candidate.importPayload),
        rawSourceData: JSON.stringify(candidate.rawSourceData),
        reviewNotes: options.reviewNotes ?? null,
      },
    });
    createdIds.push(created.id);
  }

  return {
    queued: createdIds.length,
    duplicate_count: duplicates.length,
    duplicates,
    ids: createdIds,
    dry_run: dryRun,
  };
}

export function isExternalIngestAdmin(request: NextRequest): boolean {
  return isAdminRequest(request);
}

export async function promotePatternCandidate(candidate: {
  id: string;
  queuedByAgentId: string;
  importPayload: string;
  status: string;
}) {
  const payload = JSON.parse(candidate.importPayload) as ImportPatternPayload;
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();

  if (title.length < 6 || description.length < 20) {
    throw new Error('Candidate payload is not strong enough to import as a pattern');
  }

  const sourceTier = classifySourceTier({
    sourceRepo: payload.source_repo,
    sourcePath: payload.source_path,
    sourceUrl: payload.source_url,
    isOfficial: Boolean(payload.is_official),
  });
  const confidence = computeConfidence({
    sourceTier,
    factCheckScore: payload.fact_check_score,
    executionScore: payload.execution_score,
    citationScore: payload.citation_score,
    expertScore: payload.expert_score,
    communityScore: payload.community_score,
  });

  const normalized = `${title}\n${description}\n${payload.code_snippet || ''}`.trim().toLowerCase();
  const contentHash = createHash('sha256').update(normalized).digest('hex');
  const existing = await db.verifiedPattern.findFirst({ where: { contentHash }, select: { id: true } });
  if (existing) {
    await db.externalIngestCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'DUPLICATE',
        promotedPatternId: existing.id,
      },
    });
    return { duplicate: true, patternId: existing.id };
  }

  const created = await db.verifiedPattern.create({
    data: {
      authorId: candidate.queuedByAgentId,
      title,
      description,
      patternType: String(payload.pattern_type || 'WORKFLOW'),
      category: String(payload.category || 'coding'),
      tags: JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
      codeSnippet: payload.code_snippet || null,
      language: payload.language || null,
      contentHash,
      isOfficial: Boolean(payload.is_official),
      sourceRepo: payload.source_repo || null,
      sourcePath: payload.source_path || null,
      sourceCommit: payload.source_commit || null,
      sourceUrl: payload.source_url || null,
      sourceFingerprint: payload.source_fingerprint || null,
      sourceTier,
      noveltyClass: payload.novelty_class ? String(payload.novelty_class).trim().toUpperCase() : null,
      deltaSummary: payload.delta_summary ? String(payload.delta_summary).trim() : null,
      originDeltaId: payload.origin_delta_id ? String(payload.origin_delta_id).trim() : null,
      confidence,
      validationStatus: isVerificationEligible(confidence) ? 'VERIFIED' : 'PENDING',
      provenance: JSON.stringify({
        imported_from_candidate_id: candidate.id,
        imported_at: new Date().toISOString(),
        external_provenance: payload.provenance || null,
      }),
    },
  });

  await db.externalIngestCandidate.update({
    where: { id: candidate.id },
    data: {
      status: 'IMPORTED_PATTERN',
      promotedPatternId: created.id,
    },
  });

  await syncAgentProgression(candidate.queuedByAgentId);

  return { duplicate: false, patternId: created.id, validationStatus: created.validationStatus };
}

export async function promoteDeltaCandidate(candidate: {
  id: string;
  queuedByAgentId: string;
  importPayload: string;
  status: string;
}) {
  const payload = JSON.parse(candidate.importPayload) as DeltaImportItem;
  const normalized = normalizeKnowledgeDeltaItem(payload);

  const existing = await db.knowledgeDelta.findUnique({
    where: { sourceFingerprint: normalized.sourceFingerprint },
    select: { id: true },
  });

  if (existing) {
    await db.externalIngestCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'DUPLICATE',
        promotedDeltaId: existing.id,
      },
    });
    return { duplicate: true, deltaId: existing.id };
  }

  const created = await db.knowledgeDelta.create({
    data: {
      authorId: candidate.queuedByAgentId,
      ...normalized.data,
    },
  });

  await db.externalIngestCandidate.update({
    where: { id: candidate.id },
    data: {
      status: 'IMPORTED_DELTA',
      promotedDeltaId: created.id,
    },
  });

  return { duplicate: false, deltaId: created.id, status: created.status };
}