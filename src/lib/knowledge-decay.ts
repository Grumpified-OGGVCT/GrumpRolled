import { computeConfidence, type SourceTier } from '@/lib/knowledge';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DecayStyle = 'linear' | 'exponential';

export interface DecayConfig {
  /** Fraction of confidence lost per day (linear mode). Default 0.02 (2%/day). */
  decayRate: number;
  /** Lambda for exponential decay: confidence *= exp(-lambda * days). Default 0.02. */
  decayLambda: number;
  /** Floor below which confidence will not decay. Default 0.10. */
  minConfidence: number;
  /** Days without access before an entry is considered stale. Default 30. */
  maxDaysStale: number;
  /** Which decay curve to use. Default 'exponential'. */
  decayStyle: DecayStyle;
}

export interface DecayInput {
  /** The base confidence before decay (0–1). */
  confidence: number;
  /** ISO-8601 timestamp of last access or verification. */
  lastAccessedAt?: string | Date | null;
  /** ISO-8601 timestamp of last recertification. */
  lastRecertifiedAt?: string | Date | null;
  /** ISO-8601 timestamp of creation (fallback anchor if no access timestamp). */
  createdAt?: string | Date | null;
  /** For batch operations: the entry's unique id. */
  entryId?: string;
}

export interface DecayResult {
  /** The confidence after applying decay. Clamped to [minConfidence, 1]. */
  decayedConfidence: number;
  /** How much confidence was lost (always ≥ 0). */
  confidenceLost: number;
  /** Number of days since the decay anchor (lastAccessedAt or fallback). */
  daysSinceAnchor: number;
  /** Whether this entry now needs recertification. */
  needsRecertification: boolean;
}

// Re-export for external callers that want to check the threshold directly.
export const RECERTIFICATION_CONFIDENCE_THRESHOLD = 0.50;

// ── Default config (roughly maps HLF "medium" decay: ~15% / week ≈ 2.1% / day) ─

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  decayRate: 0.02,
  decayLambda: 0.02,
  minConfidence: 0.10,
  maxDaysStale: 30,
  decayStyle: 'exponential',
};

/**
 * Per-tier decay presets.
 *
 * HLF's source→decay-rule mapping translated to grumprolled source tiers:
 *   S  = "slow"   (user_stated, tool_output, shell_output, hlf_symbolic_proof) → 0.7%/day
 *   A  = "medium" (model_inference, conversation_context)                       → 2.1%/day
 *   B  = "medium"                                                                 → 2.1%/day
 *   C  = "fast"   (web_search, unknown)                                         → 4.3%/day
 */
export const TIER_DECAY_PRESETS: Record<SourceTier, DecayConfig> = {
  S: {
    decayRate: 0.007,
    decayLambda: 0.007,
    minConfidence: 0.30,
    maxDaysStale: 90,
    decayStyle: 'exponential',
  },
  A: {
    decayRate: 0.02,
    decayLambda: 0.02,
    minConfidence: 0.15,
    maxDaysStale: 45,
    decayStyle: 'exponential',
  },
  B: {
    decayRate: 0.03,
    decayLambda: 0.03,
    minConfidence: 0.10,
    maxDaysStale: 30,
    decayStyle: 'exponential',
  },
  C: {
    decayRate: 0.043,
    decayLambda: 0.043,
    minConfidence: 0.05,
    maxDaysStale: 14,
    decayStyle: 'exponential',
  },
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

function clamp(min: number, max: number, value: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveAnchorDate(input: DecayInput): Date | null {
  const candidate =
    input.lastAccessedAt ??
    input.lastRecertifiedAt ??
    input.createdAt;

  if (!candidate) return null;

  const date = typeof candidate === 'string' ? new Date(candidate) : candidate;
  if (isNaN(date.getTime())) return null;
  return date;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

// ── Core decay functions ───────────────────────────────────────────────────────

/**
 * Apply time-based decay to a single confidence value.
 *
 * This is the low-level pure function — no knowledge model awareness.
 * Use `computeConfidenceDecay()` for the grumprolled knowledge entry wrapper.
 */
export function decayConfidence(
  input: DecayInput,
  config: Partial<DecayConfig> = {},
): DecayResult {
  const cfg: DecayConfig = { ...DEFAULT_DECAY_CONFIG, ...config };

  const anchor = resolveAnchorDate(input);
  if (!anchor) {
    return {
      decayedConfidence: input.confidence,
      confidenceLost: 0,
      daysSinceAnchor: 0,
      needsRecertification: input.confidence < RECERTIFICATION_CONFIDENCE_THRESHOLD,
    };
  }

  const now = new Date();
  const days = daysBetween(now, anchor);

  if (days <= 0) {
    return {
      decayedConfidence: input.confidence,
      confidenceLost: 0,
      daysSinceAnchor: 0,
      needsRecertification: input.confidence < RECERTIFICATION_CONFIDENCE_THRESHOLD,
    };
  }

  let decayed: number;
  if (cfg.decayStyle === 'linear') {
    decayed = input.confidence - cfg.decayRate * days;
  } else {
    decayed = input.confidence * Math.exp(-cfg.decayLambda * days);
  }

  decayed = clamp(cfg.minConfidence, 1, decayed);

  return {
    decayedConfidence: Math.round(decayed * 1000) / 1000,
    confidenceLost: Math.round(Math.max(0, input.confidence - decayed) * 1000) / 1000,
    daysSinceAnchor: Math.round(days * 100) / 100,
    needsRecertification: decayed < RECERTIFICATION_CONFIDENCE_THRESHOLD,
  };
}

/**
 * Return a DecayConfig for the given source tier.
 * Falls back to DEFAULT_DECAY_CONFIG if the tier is unrecognized.
 */
export function decayConfigForTier(tier: SourceTier): DecayConfig {
  return TIER_DECAY_PRESETS[tier] ?? DEFAULT_DECAY_CONFIG;
}

// ── Knowledge-entry-level wrappers ─────────────────────────────────────────────

export interface KnowledgeDecayEntry {
  confidence: number;
  sourceTier?: string | null;
  lastAccessedAt?: string | Date | null;
  lastRecertifiedAt?: string | Date | null;
  createdAt?: string | Date | null;
  validationStatus?: string | null;
}

/**
 * Compute how much confidence should decay for a grumprolled knowledge entry.
 *
 * Uses the entry's source tier to select a decay preset, then delegates to
 * `decayConfidence()`.
 */
export function computeConfidenceDecay(
  entry: KnowledgeDecayEntry,
  now?: Date,
): DecayResult {
  const tier = (entry.sourceTier as SourceTier) ?? 'C';
  const config = decayConfigForTier(tier);

  return decayConfidence(
    {
      confidence: entry.confidence,
      lastAccessedAt: entry.lastAccessedAt,
      lastRecertifiedAt: entry.lastRecertifiedAt,
      createdAt: entry.createdAt,
    },
    config,
  );
}

/**
 * Compute the "effective" confidence — base confidence after applying decay.
 *
 * This is the `decayed_confidence` computed field concept.
 * Combines `computeConfidence()`-style base + time decay.
 */
export function decayedConfidence(
  entry: KnowledgeDecayEntry,
  now?: Date,
): number {
  return computeConfidenceDecay(entry, now).decayedConfidence;
}

/**
 * Check whether an entry is stale and needs recertification.
 *
 * Stale = days since last access exceeds maxDaysStale for its tier,
 * OR confidence has decayed below the recertification threshold.
 */
export function isStale(
  entry: KnowledgeDecayEntry,
  maxDaysStaleOverride?: number,
): boolean {
  const tier = (entry.sourceTier as SourceTier) ?? 'C';
  const config = decayConfigForTier(tier);
  const maxDays = maxDaysStaleOverride ?? config.maxDaysStale;

  const result = computeConfidenceDecay(entry);

  if (result.needsRecertification) return true;
  if (result.daysSinceAnchor >= maxDays) return true;

  return false;
}

// ── Recertification trigger ────────────────────────────────────────────────────

export type RecertificationAction =
  | { type: 'NONE'; reason: 'confidence_sufficient' }
  | { type: 'FLAG_FOR_REVIEW'; reason: 'confidence_decayed'; decayedTo: number; threshold: number }
  | { type: 'FLAG_FOR_REVIEW'; reason: 'stale'; daysSinceAccess: number; maxDays: number }
  | { type: 'QUEUE_REVERIFICATION'; reason: string; decayedTo: number };

/**
 * Determine what recertification action (if any) should be taken for an entry.
 *
 * This is the trigger that would fire a review workflow — it does NOT mutate
 * the entry, it returns the prescribed action. Callers (e.g. a cron job or
 * API route) should apply the action to the database.
 */
export function recertifyEntry(
  entry: KnowledgeDecayEntry,
  maxDaysStaleOverride?: number,
): RecertificationAction {
  const tier = (entry.sourceTier as SourceTier) ?? 'C';
  const config = decayConfigForTier(tier);
  const maxDays = maxDaysStaleOverride ?? config.maxDaysStale;
  const result = computeConfidenceDecay(entry);

  if (result.daysSinceAnchor >= maxDays) {
    return {
      type: 'FLAG_FOR_REVIEW',
      reason: 'stale',
      daysSinceAccess: result.daysSinceAnchor,
      maxDays,
    };
  }

  if (result.needsRecertification) {
    return {
      type: 'FLAG_FOR_REVIEW',
      reason: 'confidence_decayed',
      decayedTo: result.decayedConfidence,
      threshold: RECERTIFICATION_CONFIDENCE_THRESHOLD,
    };
  }

  return { type: 'NONE', reason: 'confidence_sufficient' };
}

// ── Batch decay ────────────────────────────────────────────────────────────────

export interface BatchDecayItem {
  entryId: string;
  confidence: number;
  sourceTier?: string | null;
  lastAccessedAt?: string | Date | null;
  lastRecertifiedAt?: string | Date | null;
  createdAt?: string | Date | null;
  validationStatus?: string | null;
}

export interface BatchDecayResult {
  entryId: string;
  decayedConfidence: number;
  confidenceLost: number;
  action: RecertificationAction;
}

/**
 * Filter a collection of knowledge entries down to the stale subset,
 * compute decay for each, and return results + prescribed actions.
 *
 * Intended for use by a scheduled job that reads rows from PostgreSQL
 * and writes back updated confidence + recertification flags.
 *
 * Usage sketch:
 * ```ts
 * const stale = await db.verifiedPattern.findMany({
 *   where: { deprecatedAt: null, validationStatus: 'VERIFIED' },
 * });
 * const items: BatchDecayItem[] = stale.map(p => ({
 *   entryId: p.id,
 *   confidence: p.confidence,
 *   sourceTier: p.sourceTier,
 *   lastAccessedAt: p.updatedAt,    // proxy until last_accessed_at exists
 *   createdAt: p.createdAt,
 * }));
 * const results = decayAllStaleEntries(items);
 * // write results back to DB…
 * ```
 */
export function decayAllStaleEntries(
  entries: BatchDecayItem[],
  maxDaysStaleOverride?: number,
): BatchDecayResult[] {
  return entries
    .filter((entry) => isStale(entry, maxDaysStaleOverride))
    .map((entry) => {
      const result = computeConfidenceDecay(entry);
      const action = recertifyEntry(entry, maxDaysStaleOverride);
      return {
        entryId: entry.entryId ?? 'unknown',
        decayedConfidence: result.decayedConfidence,
        confidenceLost: result.confidenceLost,
        action,
      };
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRISMA SCHEMA CHANGES REQUIRED
// ═══════════════════════════════════════════════════════════════════════════════
//
// The following fields should be added to VerifiedPattern, KnowledgeDelta,
// and KnowledgeArticle models to support decay tracking:
//
//   lastAccessedAt    DateTime?   // updated on every read / verification access
//   lastRecertifiedAt DateTime?   // set when a recertification review completes
//   decayedConfidence Float?      // cached result of computeConfidenceDecay()
//   recertificationStatus String? // NONE | PENDING_REVIEW | IN_REVIEW
//
// Migration SQL sketch:
//
//   ALTER TABLE "VerifiedPattern"
//     ADD COLUMN "lastAccessedAt"      TIMESTAMPTZ,
//     ADD COLUMN "lastRecertifiedAt"   TIMESTAMPTZ,
//     ADD COLUMN "decayedConfidence"   DOUBLE PRECISION,
//     ADD COLUMN "recertificationStatus" TEXT DEFAULT 'NONE';
//
//   ALTER TABLE "KnowledgeDelta"
//     ADD COLUMN "lastAccessedAt"      TIMESTAMPTZ,
//     ADD COLUMN "lastRecertifiedAt"   TIMESTAMPTZ,
//     ADD COLUMN "decayedConfidence"   DOUBLE PRECISION,
//     ADD COLUMN "recertificationStatus" TEXT DEFAULT 'NONE';
//
//   ALTER TABLE "KnowledgeArticle"
//     ADD COLUMN "lastAccessedAt"      TIMESTAMPTZ,
//     ADD COLUMN "lastRecertifiedAt"   TIMESTAMPTZ,
//     ADD COLUMN "decayedConfidence"   DOUBLE PRECISION,
//     ADD COLUMN "recertificationStatus" TEXT DEFAULT 'NONE';
//
// Index suggestion for batch stale queries:
//
//   CREATE INDEX idx_vp_stale ON "VerifiedPattern"
//     (validationStatus, lastAccessedAt)
//     WHERE deprecatedAt IS NULL;
//
// ═══════════════════════════════════════════════════════════════════════════════
