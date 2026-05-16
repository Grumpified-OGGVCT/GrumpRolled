// ── knowledge-contradiction.ts ──────────────────────────────────────────────────
// Contradiction detection for grumprolled's community knowledge bank.
// Extracted from HLF's memory_bridge.py MstyMemoryBridge.detect_contradictions.
//
// Core insight: when a new pattern arrives that talks about the same topic as
// an existing pattern but makes an opposing claim, we flag it instead of
// silently accepting both. This prevents the knowledge bank from accumulating
// conflicting advice that erodes trust.
//
// Integration points:
//   - external-ingest.ts → promotePatternCandidate() — call
//     checkNewPatternForContradictions() before promoting
//   - Dashboard review queue → getUnresolvedContradictions()
//   - Resolution flow → resolveContradiction()

import { db } from '@/lib/db';
import { semanticSearch, type SearchResult } from '@/lib/embeddings';

// ── Types ──────────────────────────────────────────────────────────────────────

/** How a contradiction was resolved (or not). */
export type ContradictionResolution =
  | 'UNRESOLVED'
  | 'RESOLVED_PREFER_A'
  | 'RESOLVED_PREFER_B'
  | 'SUPERSEDED'       // newer supersedes older (by explicit human / agent choice)
  | 'ACKNOWLEDGED'     // conflict is real, both are valid in different contexts
  | 'MERGED';          // entries were reconciled into a single pattern

/** Shape of a contradiction result returned when comparing two knowledge items. */
export interface ContradictionResult {
  patternA: {
    id: string;
    title: string;
    tags: string[];
    description: string;
    /** Inferred recommendation direction from the entry's content / tags / delta. */
    recommendation: string | null;
  };
  patternB: {
    id: string;
    title: string;
    tags: string[];
    description: string;
    recommendation: string | null;
  };
  /** Cosine similarity from the embedding vector search (0–1). */
  similarity: number;
  /**
   * 0–1 score representing how strong the contradiction is.
   *   = similarity * (1 - recommendationAlignment)
   * A high-similarity pair with opposite recommendations scores high.
   */
  conflictScore: number;
  /** Jaccard overlap of the two tag sets (0–1). */
  topicOverlap: number;
  /** Human-readable explanation of why this pair was flagged. */
  reason: string;
}

/** Persisted contradiction record (maps to the Contradiction table). */
export interface ContradictionRecord {
  id: string;
  patternIdA: string;
  patternIdB: string;
  similarity: number;
  conflictScore: number;
  topicOverlap: number;
  resolution: ContradictionResolution;
  resolvedById: string | null;
  resolvedAt: Date | null;
  recommendation: string | null;
  reason: string;
  createdAt: Date;
}

/** Options for findContradictions(). */
export interface FindContradictionsOptions {
  /** Minimum semantic similarity threshold (default 0.7). */
  similarityThreshold?: number;
  /** Maximum candidate results to scan (default 10). */
  limit?: number;
  /** Content type to search (default 'PATTERN'). Also searches 'DELTA' when set. */
  contentType?: string;
  /** If true, also scans KnowledgeDelta entries for contradictions. */
  includeDeltas?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_LIMIT = 10;
const CONFLICT_SIMILARITY_MIN = 0.5;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Safe JSON parse for tag arrays stored as JSON strings. */
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [];
  } catch {
    // Handle comma-separated fallback
    return raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  }
}

/** Jaccard similarity between two string arrays. */
function jaccardOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Infer a rough "recommendation direction" from a pattern's tags and description.
 * Returns a canonical direction string like "USE", "AVOID", "DEPRECATE", "PREFER",
 * or null when nothing is clear.
 *
 * This is a lightweight heuristic — it does not run an LLM. The goal is to
 * catch obvious binary conflicts (use-X vs avoid-X) without heavy machinery.
 */
function inferRecommendation(title: string, tags: string[], description: string): string | null {
  const text = `${title} ${description} ${tags.join(' ')}`.toLowerCase();

  // Strong negative signals
  if (/\b(deprecate|avoid|do not use|anti.?pattern|harmful|dangerous|never|don'?t)\b/i.test(text)) {
    if (tags.some((t) => t.startsWith('deprecate') || t === 'avoid' || t.startsWith('anti'))) {
      return 'AVOID';
    }
    return 'AVOID';
  }

  // Positive signals
  if (/\b(recommend|prefer|use|should|best practice|gold standard|go.?to|trusted)\b/i.test(text)) {
    if (tags.some((t) => t.startsWith('use-') || t.startsWith('best-') || t === 'recommended')) {
      return 'USE';
    }
    return 'USE';
  }

  // Deprecated patterns: if deprecatedAt is set, the recommendation is AVOID
  // (handled upstream, but we check tags too)
  if (tags.includes('deprecated') || tags.some((t) => t.startsWith('avoid-'))) {
    return 'AVOID';
  }

  if (tags.some((t) => t.startsWith('use-'))) {
    return 'USE';
  }

  return null;
}

/**
 * Compute a recommendation-alignment score between two recommendations.
 *   1.0 = same direction (both USE, both AVOID)
 *   0.5 = one or both null (ambiguous)
 *   0.0 = opposite (USE vs AVOID)
 *   0.3 = related but not identical (e.g. PREFER vs USE)
 */
function recommendationAlignment(recA: string | null, recB: string | null): number {
  if (recA === null || recB === null) return 0.5; // ambiguous
  if (recA === recB) return 1.0;

  // Same family
  const positive = new Set(['USE', 'PREFER', 'RECOMMEND']);
  const negative = new Set(['AVOID', 'DEPRECATE', 'ANTI']);

  if (positive.has(recA) && positive.has(recB)) return 0.6;
  if (negative.has(recA) && negative.has(recB)) return 0.6;

  // Cross-family — strong contradiction
  if ((positive.has(recA) && negative.has(recB)) || (negative.has(recA) && positive.has(recB))) {
    return 0.0;
  }

  return 0.3;
}

/** Build a human-readable reason string for a contradiction pair. */
function buildReason(
  recA: string | null,
  recB: string | null,
  similarity: number,
  topicOverlap: number,
  tagsA: string[],
  tagsB: string[],
): string {
  const reasons: string[] = [];

  if (similarity >= 0.85) {
    reasons.push('Very high semantic similarity — likely the same topic with opposing claims.');
  } else if (similarity >= 0.7) {
    reasons.push('High semantic similarity with conflicting recommendations.');
  }

  if (recA !== null && recB !== null && recA !== recB) {
    reasons.push(`Recommendation mismatch: "${recA}" vs "${recB}".`);
  }

  // Find directly opposing tags
  const opposePairs: string[] = [];
  for (const ta of tagsA) {
    for (const tb of tagsB) {
      if (
        (ta.startsWith('use-') && tb.startsWith('avoid-') && ta.slice(4) === tb.slice(6)) ||
        (ta.startsWith('avoid-') && tb.startsWith('use-') && ta.slice(6) === tb.slice(4))
      ) {
        opposePairs.push(`"${ta}" ↔ "${tb}"`);
      }
    }
  }
  if (opposePairs.length > 0) {
    reasons.push(`Directly opposing tags: ${opposePairs.join(', ')}.`);
  }

  if (topicOverlap >= 0.6) {
    reasons.push('High tag overlap confirms the same topic domain.');
  }

  return reasons.join(' ') || 'Potential contradiction detected via semantic similarity.';
}

// ── DB write helpers ───────────────────────────────────────────────────────────

async function loadPatternContent(id: string): Promise<{
  title: string;
  description: string;
  tags: string[];
} | null> {
  const row = await db.verifiedPattern.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, tags: true },
  });
  if (!row) return null;
  return { title: row.title, description: row.description, tags: parseTags(row.tags) };
}

async function loadDeltaContent(id: string): Promise<{
  title: string;
  description: string;
  tags: string[];
  decisionRecommendation: string | null;
} | null> {
  const row = await db.knowledgeDelta.findUnique({
    where: { id },
    select: {
      id: true,
      sourceTitle: true,
      primaryMechanism: true,
      topicTags: true,
      decisionRecommendation: true,
    },
  });
  if (!row) return null;
  return {
    title: row.sourceTitle,
    description: row.primaryMechanism,
    tags: parseTags(row.topicTags),
    decisionRecommendation: row.decisionRecommendation ?? null,
  };
}

// ── 1. findContradictions ──────────────────────────────────────────────────────

/**
 * Search for existing knowledge items that may contradict the given pattern.
 *
 * Strategy (adapted from HLF memory_bridge.py):
 *   1. Run semantic search for similar patterns/deltas.
 *   2. Compute tag overlap (Jaccard) for candidate pairs.
 *   3. Infer recommendation directions ("USE" / "AVOID") from tags + content.
 *   4. Compute conflictScore = similarity * (1 - recommendationAlignment).
 *   5. Rank candidates by conflictScore descending.
 */
export async function findContradictions(
  pattern: {
    id?: string;
    title: string;
    description: string;
    tags: string[];
  },
  options: FindContradictionsOptions = {},
): Promise<ContradictionResult[]> {
  const {
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    limit = DEFAULT_LIMIT,
    contentType = 'PATTERN',
    includeDeltas = true,
  } = options;

  const queryText = `${pattern.title}\n${pattern.description}`;
  const recA = inferRecommendation(pattern.title, pattern.tags, pattern.description);

  // Search patterns first
  const patternResults = contentType === 'PATTERN'
    ? await semanticSearch(queryText, {
        contentType: 'PATTERN',
        limit,
        threshold: similarityThreshold,
      })
    : [];

  // Optionally search deltas too
  const deltaResults = includeDeltas
    ? await semanticSearch(queryText, {
        contentType: 'ANSWER', // HACK: deltas don't have their own embedding contentType
        // We'll handle delta IDs separately below; for now scan PATTERN results
        // and also do a raw delta search
        limit: Math.ceil(limit / 2),
        threshold: similarityThreshold,
      })
    : [];

  // Collect candidate IDs from search results (exclude self)
  const excludeId = pattern.id;
  const candidateIds = new Set(
    patternResults
      .filter((r) => r.contentId !== excludeId)
      .map((r) => r.contentId),
  );

  // Also do a raw similarity search on KnowledgeDelta content embeddings if available
  if (includeDeltas) {
    // semanticSearch already covers PATTERN type; we'll explicitly load delta
    // candidates through a separate mechanism — by matching on tags
  }

  // Load full content for each candidate
  const candidates: Array<{
    id: string;
    title: string;
    description: string;
    tags: string[];
    recommendation: string | null;
    similarity: number;
  }> = [];

  for (const r of patternResults) {
    if (r.contentId === excludeId) continue;

    let content;
    if (r.contentType === 'PATTERN') {
      content = await loadPatternContent(r.contentId);
    } else {
      content = await loadDeltaContent(r.contentId);
    }
    if (!content) continue;

    const recB = 'decisionRecommendation' in content
      ? (content as { decisionRecommendation: string | null }).decisionRecommendation ??
        inferRecommendation(content.title, content.tags, content.description)
      : inferRecommendation(content.title, content.tags, content.description);

    candidates.push({
      id: r.contentId,
      title: content.title,
      description: content.description,
      tags: content.tags,
      recommendation: recB,
      similarity: r.similarity,
    });
  }

  // If includeDeltas, also scan KnowledgeDelta by title/text overlap as a fallback
  if (includeDeltas) {
    try {
      const deltaCandidates = await db.$queryRawUnsafe<
        Array<{
          id: string;
          sourceTitle: string;
          primaryMechanism: string;
          topicTags: string | null;
          decisionRecommendation: string | null;
        }>
      >(
        `SELECT kd.id, kd."sourceTitle", kd."primaryMechanism", kd."topicTags", kd."decisionRecommendation"
         FROM "KnowledgeDelta" kd
         WHERE kd.status != 'ARCHIVED'
         AND kd.status != 'REJECTED'
         AND (
           kd."sourceTitle" ILIKE $1
           OR kd."primaryMechanism" ILIKE $1
           OR kd."topicTags" ILIKE $1
         )
         LIMIT $2`,
        `%${pattern.title.slice(0, 40)}%`,
        Math.ceil(limit / 2),
      );
      for (const d of deltaCandidates) {
        if (d.id === excludeId) continue;
        if (candidates.some((c) => c.id === d.id)) continue;

        const tags = parseTags(d.topicTags);
        const recB = d.decisionRecommendation ?? inferRecommendation(d.sourceTitle, tags, d.primaryMechanism);

        candidates.push({
          id: d.id,
          title: d.sourceTitle,
          description: d.primaryMechanism,
          tags,
          recommendation: recB,
          similarity: 0.65, // approximate—we didn't embed-search this
        });
      }
    } catch {
      // Fallback query may fail if KnowledgeDelta table doesn't exist yet
    }
  }

  // Compute conflict scores and filter
  const results: ContradictionResult[] = [];

  for (const candidate of candidates) {
    const topicOverlap = jaccardOverlap(pattern.tags, candidate.tags);
    const align = recommendationAlignment(recA, candidate.recommendation);
    const conflictScore = candidate.similarity * (1 - align);

    // Only report meaningful contradictions
    if (conflictScore < 0.2) continue;
    if (align >= 0.8 && topicOverlap < 0.15) continue; // high alignment, low topic overlap = not interesting

    results.push({
      patternA: {
        id: pattern.id ?? 'new',
        title: pattern.title,
        tags: pattern.tags,
        description: pattern.description.slice(0, 200),
        recommendation: recA,
      },
      patternB: {
        id: candidate.id,
        title: candidate.title,
        tags: candidate.tags,
        description: candidate.description.slice(0, 200),
        recommendation: candidate.recommendation,
      },
      similarity: candidate.similarity,
      conflictScore,
      topicOverlap,
      reason: buildReason(
        recA,
        candidate.recommendation,
        candidate.similarity,
        topicOverlap,
        pattern.tags,
        candidate.tags,
      ),
    });
  }

  // Sort by conflictScore descending
  results.sort((a, b) => b.conflictScore - a.conflictScore);

  return results;
}

// ── 2. checkNewPatternForContradictions ─────────────────────────────────────────

/**
 * Run on pattern creation / promotion. Finds existing patterns that contradict
 * the new one and optionally persists Contradiction records.
 *
 * Returns the ranked list of contradiction results. When contradictions exceed
 * the severity threshold, the caller should consider blocking or queueing for
 * review instead of auto-publishing.
 */
export async function checkNewPatternForContradictions(
  newPattern: {
    id?: string;
    title: string;
    description: string;
    tags: string[];
  },
  options: {
    /** Persist contradiction records for later review (default true). */
    persist?: boolean;
    /** Minimum conflictScore to consider a contradiction actionable (default 0.3). */
    severityThreshold?: number;
    similarityThreshold?: number;
    limit?: number;
  } = {},
): Promise<ContradictionResult[]> {
  const {
    persist = true,
    severityThreshold = 0.3,
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    limit = DEFAULT_LIMIT,
  } = options;

  const contradictions = await findContradictions(newPattern, {
    similarityThreshold,
    limit,
    includeDeltas: true,
  });

  // Filter by severity
  const actionable = contradictions.filter((c) => c.conflictScore >= severityThreshold);

  if (persist && actionable.length > 0 && newPattern.id) {
    for (const c of actionable) {
      try {
        // Check for existing contradiction between this pair
        const existing = await db.$queryRawUnsafe<
          Array<{ id: string }>
        >(
          `SELECT id FROM "Contradiction"
           WHERE ("patternIdA" = $1 AND "patternIdB" = $2)
              OR ("patternIdA" = $2 AND "patternIdB" = $1)
           LIMIT 1`,
          newPattern.id,
          c.patternB.id,
        );

        if (existing.length > 0) continue; // already tracked

        await db.$executeRawUnsafe(
          `INSERT INTO "Contradiction" ("id", "patternIdA", "patternIdB", "similarity", "conflictScore", "topicOverlap", "resolution", "reason", "recommendation", "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'UNRESOLVED', $6, $7, NOW())`,
          newPattern.id,
          c.patternB.id,
          c.similarity,
          c.conflictScore,
          c.topicOverlap,
          c.reason,
          `A says "${c.patternA.recommendation ?? 'unknown'}", B says "${c.patternB.recommendation ?? 'unknown'}"`,
        );
      } catch {
        // Table may not exist yet — gracefully skip persistence
      }
    }
  }

  return actionable;
}

// ── 3. resolveContradiction ────────────────────────────────────────────────────

/**
 * Mark a contradiction as resolved with a chosen resolution strategy.
 *
 * Resolutions:
 *   - RESOLVED_PREFER_A / RESOLVED_PREFER_B: one entry is correct, the other deprecated
 *   - SUPERSEDED: a newer entry replaces the older
 *   - ACKNOWLEDGED: both are valid in different contexts
 *   - MERGED: entries were reconciled into a single pattern
 */
export async function resolveContradiction(
  contradictionId: string,
  resolution: ContradictionResolution,
  resolvedById: string,
): Promise<boolean> {
  try {
    const result = await db.$executeRawUnsafe(
      `UPDATE "Contradiction"
       SET "resolution" = $1,
           "resolvedById" = $2,
           "resolvedAt" = NOW()
       WHERE "id" = $3 AND "resolution" = 'UNRESOLVED'`,
      resolution,
      resolvedById,
      contradictionId,
    );
    return result > 0;
  } catch {
    return false;
  }
}

// ── 4. getUnresolvedContradictions ─────────────────────────────────────────────

/**
 * Dashboard query: returns unresolved contradictions ordered by severity.
 * Used by the review queue UI to surface knowledge conflicts that need
 * human or agent attention.
 */
export async function getUnresolvedContradictions(
  limit = 20,
): Promise<Array<ContradictionRecord & { titleA: string; titleB: string }>> {
  try {
    const rows = await db.$queryRawUnsafe<
      Array<{
        id: string;
        patternIdA: string;
        patternIdB: string;
        similarity: number;
        conflictScore: number;
        topicOverlap: number;
        resolution: string;
        resolvedById: string | null;
        resolvedAt: string | null;
        recommendation: string | null;
        reason: string | null;
        createdAt: string;
        titleA: string;
        titleB: string;
      }>
    >(
      `SELECT
         c.id,
         c."patternIdA",
         c."patternIdB",
         c."similarity",
         c."conflictScore",
         c."topicOverlap",
         c."resolution",
         c."resolvedById",
         c."resolvedAt",
         c."recommendation",
         c."reason",
         c."createdAt",
         COALESCE(vp.title, kd."sourceTitle", 'Unknown') AS "titleA",
         COALESCE(vp2.title, kd2."sourceTitle", 'Unknown') AS "titleB"
       FROM "Contradiction" c
       LEFT JOIN "VerifiedPattern" vp ON c."patternIdA" = vp.id
       LEFT JOIN "KnowledgeDelta" kd ON c."patternIdA" = kd.id
       LEFT JOIN "VerifiedPattern" vp2 ON c."patternIdB" = vp2.id
       LEFT JOIN "KnowledgeDelta" kd2 ON c."patternIdB" = kd2.id
       WHERE c."resolution" = 'UNRESOLVED'
       ORDER BY c."conflictScore" DESC
       LIMIT $1`,
      limit,
    );

    return rows.map((r) => ({
      id: r.id,
      patternIdA: r.patternIdA,
      patternIdB: r.patternIdB,
      similarity: r.similarity,
      conflictScore: r.conflictScore,
      topicOverlap: r.topicOverlap,
      resolution: r.resolution as ContradictionResolution,
      resolvedById: r.resolvedById ?? null,
      resolvedAt: r.resolvedAt ? new Date(r.resolvedAt) : null,
      recommendation: r.recommendation ?? null,
      reason: r.reason ?? '',
      createdAt: new Date(r.createdAt),
      titleA: r.titleA,
      titleB: r.titleB,
    }));
  } catch {
    return [];
  }
}

// ── 5. getContradictionSummary ──────────────────────────────────────────────────

/**
 * Quick stats for the contradiction review queue badge.
 * Returns counts by resolution status.
 */
export async function getContradictionSummary(): Promise<{
  unresolved: number;
  acknowledged: number;
  resolved: number;
  total: number;
}> {
  try {
    const rows = await db.$queryRawUnsafe<
      Array<{ resolution: string; count: bigint }>
    >(
      `SELECT "resolution", COUNT(*)::bigint as count
       FROM "Contradiction"
       GROUP BY "resolution"`,
    );

    let unresolved = 0;
    let acknowledged = 0;
    let resolved = 0;

    for (const r of rows) {
      const n = Number(r.count);
      if (r.resolution === 'UNRESOLVED') unresolved = n;
      else if (r.resolution === 'ACKNOWLEDGED') acknowledged = n;
      else resolved += n;
    }

    return {
      unresolved,
      acknowledged,
      resolved,
      total: unresolved + acknowledged + resolved,
    };
  } catch {
    return { unresolved: 0, acknowledged: 0, resolved: 0, total: 0 };
  }
}

// ── 6. checkCandidateBeforePromotion ───────────────────────────────────────────

/**
 * Drop-in integration for external-ingest.ts promotePatternCandidate().
 *
 * Call this BEFORE creating the VerifiedPattern to check if the candidate
 * would contradict existing knowledge. Returns:
 *   - ok: boolean — false if a hard contradiction was found (caller should block)
 *   - warnings: ContradictionResult[] — the contradictions found
 *   - blocked: boolean — true if promotion should be gated
 *
 * Gating logic:
 *   - conflictScore >= 0.5 AND similarity >= 0.8 → BLOCK (hard contradiction)
 *   - conflictScore >= 0.3 → WARN (flag for review but allow)
 *   - conflictScore < 0.3 → OK
 */
export async function checkCandidateBeforePromotion(candidate: {
  title: string;
  description: string;
  tags?: string[];
}): Promise<{
  ok: boolean;
  blocked: boolean;
  warnings: ContradictionResult[];
}> {
  const tags = candidate.tags ?? [];
  const contradictions = await findContradictions(
    {
      title: candidate.title,
      description: candidate.description,
      tags,
    },
    { similarityThreshold: 0.65, limit: 5, includeDeltas: true },
  );

  if (contradictions.length === 0) {
    return { ok: true, blocked: false, warnings: [] };
  }

  const blocked = contradictions.some(
    (c) => c.conflictScore >= 0.5 && c.similarity >= 0.8,
  );

  return {
    ok: !blocked,
    blocked,
    warnings: contradictions,
  };
}

/*
============================================================================
 PRISMA SCHEMA CHANGES REQUIRED
============================================================================

Add the following model to prisma/schema.prisma:

```
model Contradiction {
  id            String   @id @default(cuid())
  patternIdA    String
  patternIdB    String
  similarity    Float    @default(0)   // cosine similarity from embeddings
  conflictScore Float    @default(0)   // similarity * (1 - alignment)
  topicOverlap  Float    @default(0)   // Jaccard overlap of tag sets
  resolution    String   @default("UNRESOLVED")
                // UNRESOLVED, RESOLVED_PREFER_A, RESOLVED_PREFER_B,
                // SUPERSEDED, ACKNOWLEDGED, MERGED
  resolvedById  String?
  resolvedAt    DateTime?
  recommendation String?  // human-readable summary of the conflict
  reason        String?   // detailed explanation of what was flagged
  createdAt     DateTime @default(now())

  @@index([patternIdA])
  @@index([patternIdB])
  @@index([resolution])
  @@index([conflictScore])
  @@index([createdAt])

  // Note: patternIdA / patternIdB can reference either VerifiedPattern or
  // KnowledgeDelta. No FK constraint is enforced at the DB level because
  // the target table varies. The application logic resolves titles via
  // LEFT JOIN queries (see getUnresolvedContradictions above).
}
```

After adding, run:
  npx prisma migrate dev --name add_contradiction_table

============================================================================
 INTEGRATION GUIDE
============================================================================

1. In external-ingest.ts → promotePatternCandidate():
   Before creating the VerifiedPattern, optionally call:

     const { blocked, warnings } = await checkCandidateBeforePromotion({
       title: payload.title,
       description: payload.description,
       tags: Array.isArray(payload.tags) ? payload.tags : [],
     });

     if (blocked) {
       // Set candidate status to REVIEW_NEEDED instead of promoting
       await db.externalIngestCandidate.update({
         where: { id: candidate.id },
         data: { status: 'REVIEW_NEEDED', reviewNotes: 'Contradiction detected with existing patterns.' },
       });
       return { blocked: true, warnings };
     }

2. After pattern creation:
     await checkNewPatternForContradictions({
       id: created.id,
       title: created.title,
       description: created.description,
       tags: parseTags(created.tags),
     });

3. API routes for the review dashboard:
   - GET  /api/v1/knowledge/contradictions → calls getUnresolvedContradictions()
   - POST /api/v1/knowledge/contradictions/:id/resolve → calls resolveContradiction()
   - GET  /api/v1/knowledge/contradictions/summary → calls getContradictionSummary()

4. Dashboard page: a "Contradiction Review Queue" showing:
   - Conflict score heat map
   - Side-by-side comparison of the two patterns
   - Resolution buttons (Prefer A, Prefer B, Acknowledge, Supersede, Merge)

============================================================================
*/
