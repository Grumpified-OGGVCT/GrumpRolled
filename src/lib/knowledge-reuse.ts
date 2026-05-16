/**
 * Knowledge Reuse Reinforcement Engine
 * -------------------------------------
 * Extracted from HLF's HKS compounding loop (memory.py query() hit tracking +
 * compounding_benchmark.py 0→25 memory hits across 3 cycles).
 *
 * Core insight: knowledge entries that get retrieved and successfully applied
 * should gain confidence over time — but reuse is ONE signal, not the only signal.
 * A pattern cited 1000 times shouldn't reach 1.0 confidence unless it's also
 * well-scored on fact/execution/citation/expert/community dimensions.
 */

import { db } from '@/lib/db';
import { computeConfidence, type ConfidenceInputs, type SourceTier } from '@/lib/knowledge';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ReinforcementConfig {
  /** Base amount added to confidence on each successful application. */
  defaultReinforcementAmount: number;
  /** Ceiling on total reinforcement contribution (prevents citation-only 1.0). */
  maxReinforcementCap: number;
  /** Half-life in days for citation age decay. */
  citationHalfLifeDays: number;
  /** Minimum time (ms) between reinforcement events from the same agent/pattern pair. */
  deduplicationWindowMs: number;
}

export const DEFAULT_REINFORCEMENT_CONFIG: ReinforcementConfig = {
  defaultReinforcementAmount: 0.005,
  maxReinforcementCap: 0.15,
  citationHalfLifeDays: 30,
  deduplicationWindowMs: 60_000, // 1 minute
};

export interface ReinforcementEvent {
  id: string;
  patternId: string;
  agentId: string;
  timestamp: Date;
  context: string | null;
  confidenceBefore: number;
  confidenceAfter: number;
  deltaApplied: number;
}

export interface ReinforcementInput {
  patternId: string;
  agentId: string;
  context?: string;
  config?: Partial<ReinforcementConfig>;
}

export interface ReinforcedPattern {
  id: string;
  title: string;
  category: string | null;
  confidence: number;
  citationCount: number;
  reinforcedConfidence: number;
  reinforcementBoost: number;
  usageCount: number;
  tags: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure computation functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the reinforcement boost from citation count, age-decayed.
 *
 * Formula: boost = min(cap, count * amount * age_decay)
 * where age_decay = 2^(-age_days / half_life_days)
 *
 * This mirrors HLF's approach where access_count compounds confidence over
 * cycles, but caps the contribution so a heavily-cited but poorly-scored
 * pattern can't fake its way to high confidence.
 */
export function computeReinforcementBoost(
  citationCount: number,
  lastCitedAt: Date | null,
  config: ReinforcementConfig = DEFAULT_REINFORCEMENT_CONFIG,
): number {
  if (citationCount <= 0) return 0;

  const ageDays = lastCitedAt
    ? Math.max(0, (Date.now() - lastCitedAt.getTime()) / (86_400_000))
    : 365; // never cited → treat as ancient

  const ageDecay = Math.pow(2, -ageDays / config.citationHalfLifeDays);
  const rawBoost = citationCount * config.defaultReinforcementAmount * ageDecay;

  return Math.min(config.maxReinforcementCap, rawBoost);
}

/**
 * Compute reinforced confidence by blending the base confidence score
 * (from fact/execution/citation/expert/community dimensions) with the
 * reuse signal (citation count + recency).
 *
 * Design: base confidence is always the floor. Reinforcement can lift it
 * by at most `maxReinforcementCap`. This ensures reuse amplifies good
 * patterns rather than laundering bad ones.
 */
export function computeReinforcedConfidence(
  baseConfidence: number,
  citationCount: number,
  lastCitedAt: Date | null,
  config: ReinforcementConfig = DEFAULT_REINFORCEMENT_CONFIG,
): number {
  const clampedBase = clamp01(baseConfidence);
  const boost = computeReinforcementBoost(citationCount, lastCitedAt, config);

  // Blend: base + boost, but boost cannot push past 1.0
  // Also, boost is scaled so low-confidence patterns benefit less
  // (a 0.2 base pattern with 10 citations = 0.2 + 0.05*0.2 = 0.21, not 0.25)
  const scaledBoost = boost * clampedBase;
  return clamp01(clampedBase + scaledBoost);
}

/**
 * Given a pattern's current state, compute the next confidence after one
 * more successful application. Returns the delta that would be applied.
 */
export function computeNextReinforcementDelta(
  currentConfidence: number,
  citationCount: number,
  lastCitedAt: Date | null,
  config: ReinforcementConfig = DEFAULT_REINFORCEMENT_CONFIG,
): { newConfidence: number; delta: number } {
  const nextCount = citationCount + 1;
  const newConfidence = computeReinforcedConfidence(
    currentConfidence,
    nextCount,
    new Date(), // just cited now
    config,
  );
  return {
    newConfidence,
    delta: clamp01(newConfidence - currentConfidence),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Async DB functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reinforce a pattern after an agent successfully applies it.
 *
 * Called at the point where an agent has:
 * 1. Retrieved a VerifiedPattern from the knowledge bank
 * 2. Applied it to solve a task
 * 3. Confirmed the application was successful
 *
 * This increments citation_count, computes the new reinforced confidence,
 * records a ReinforcementEvent, and updates the pattern row.
 *
 * Returns the new confidence and the recorded event.
 */
export async function reinforcePattern(
  patternId: string,
  agentId: string,
  context?: string,
  config: Partial<ReinforcementConfig> = {},
): Promise<{ confidence: number; event: ReinforcementEvent }> {
  const cfg = { ...DEFAULT_REINFORCEMENT_CONFIG, ...config };

  // Fetch current state
  const pattern = await db.verifiedPattern.findUnique({
    where: { id: patternId },
    select: {
      id: true,
      confidence: true,
      usageCount: true,
    },
  });

  if (!pattern) {
    throw new Error(`Pattern not found: ${patternId}`);
  }

  // Check deduplication: same agent/pattern within window
  const existingEvent = await db.reinforcementEvent.findFirst({
    where: {
      patternId,
      agentId,
      timestamp: {
        gte: new Date(Date.now() - cfg.deduplicationWindowMs),
      },
    },
    orderBy: { timestamp: 'desc' },
  });

  if (existingEvent) {
    return {
      confidence: existingEvent.confidenceAfter,
      event: existingEvent as ReinforcementEvent,
    };
  }

  // Count existing citations
  const citationCount = await db.reinforcementEvent.count({
    where: { patternId },
  });

  // Compute new confidence
  const { newConfidence, delta } = computeNextReinforcementDelta(
    pattern.confidence,
    citationCount,
    null, // will be updated below
    cfg,
  );

  // Record the event and update the pattern in a transaction
  const [event] = await db.$transaction([
    db.reinforcementEvent.create({
      data: {
        patternId,
        agentId,
        context: context ?? null,
        confidenceBefore: pattern.confidence,
        confidenceAfter: newConfidence,
        deltaApplied: delta,
      },
    }),
    db.verifiedPattern.update({
      where: { id: patternId },
      data: {
        confidence: newConfidence,
        usageCount: { increment: 1 },
      },
    }),
  ]);

  return { confidence: newConfidence, event: event as ReinforcementEvent };
}

/**
 * Get top patterns ranked by (citation_count * confidence) descending.
 * This is the "community wisdom" ranking — patterns that are both well-scored
 * AND frequently reused rise to the top.
 *
 * Optional category filter.
 */
export async function getTopReinforcedPatterns(
  limit: number = 10,
  category?: string,
): Promise<ReinforcedPattern[]> {
  const where = category ? { category, deprecatedAt: null } : { deprecatedAt: null };

  const patterns = await db.verifiedPattern.findMany({
    where,
    select: {
      id: true,
      title: true,
      category: true,
      confidence: true,
      usageCount: true,
      tags: true,
      _count: {
        select: { reinforcementEvents: true },
      },
    },
    orderBy: [
      { usageCount: 'desc' },
      { confidence: 'desc' },
    ],
    take: limit,
  });

  return patterns.map((p) => {
    const citationCount = p._count.reinforcementEvents;
    const boost = computeReinforcementBoost(citationCount, null);
    return {
      id: p.id,
      title: p.title,
      category: p.category,
      confidence: p.confidence,
      citationCount,
      reinforcedConfidence: computeReinforcedConfidence(p.confidence, citationCount, null),
      reinforcementBoost: Math.round(boost * 1000) / 1000,
      usageCount: p.usageCount,
      tags: safeParseTags(p.tags),
    };
  });
}

/**
 * Get reinforcement history for a specific pattern.
 */
export async function getPatternReinforcementHistory(
  patternId: string,
  limit: number = 20,
): Promise<ReinforcementEvent[]> {
  return db.reinforcementEvent.findMany({
    where: { patternId },
    orderBy: { timestamp: 'desc' },
    take: limit,
  }) as Promise<ReinforcementEvent[]>;
}

/**
 * Get reinforcement stats for an agent (how many patterns they've reinforced).
 */
export async function getAgentReinforcementStats(agentId: string): Promise<{
  totalReinforcements: number;
  uniquePatterns: number;
  averageDelta: number;
}> {
  const events = await db.reinforcementEvent.findMany({
    where: { agentId },
    select: { patternId: true, deltaApplied: true },
  });

  const uniquePatterns = new Set(events.map((e) => e.patternId)).size;
  const averageDelta =
    events.length > 0
      ? events.reduce((sum, e) => sum + e.deltaApplied, 0) / events.length
      : 0;

  return {
    totalReinforcements: events.length,
    uniquePatterns,
    averageDelta: Math.round(averageDelta * 1000) / 1000,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function safeParseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Prisma Schema Changes Required
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. Add to the `VerifiedPattern` model:
//
//   citationCount Int @default(0)
//   // How many times this pattern has been successfully cited/applied.
//   // Distinct from `usageCount` which tracks general accesses.
//   // Incremented by reinforcePattern().
//
//   lastCitedAt   DateTime?
//   // Timestamp of the most recent successful application.
//   // Used for age-decay in computeReinforcementBoost().
//
// 2. Add new model after `PatternValidation` (or wherever makes sense):
//
// model ReinforcementEvent {
//   id               String   @id @default(cuid())
//   patternId        String
//   agentId          String
//   timestamp        DateTime @default(now())
//   context          String?
//   // What task/query was the agent solving when they applied this pattern?
//   confidenceBefore Float
//   confidenceAfter  Float
//   deltaApplied     Float    @default(0)
//   // Amount confidence shifted (after - before), always >= 0.
//
//   pattern VerifiedPattern @relation(fields: [patternId], references: [id], onDelete: Cascade)
//   agent   Agent           @relation(fields: [agentId], references: [id], onDelete: Cascade)
//
//   @@index([patternId])
//   @@index([agentId])
//   @@index([patternId, agentId, timestamp])
//   @@index([timestamp])
// }
//
// 3. Run: npx prisma generate && npx prisma db push
//
// ═══════════════════════════════════════════════════════════════════════════
// Integration Points (do NOT modify these files — document only)
// ═══════════════════════════════════════════════════════════════════════════
//
// A. Pattern application flow (where reinforcePattern should be called):
//    - After an agent retrieves a pattern and confirms it solved their task
//    - In the agent executor / task runner, right after successful application
//    - Example pseudocode:
//        import { reinforcePattern } from '@/lib/knowledge-reuse';
//        // ... after pattern applied successfully:
//        await reinforcePattern(pattern.id, agent.id, taskDescription);
//
// B. Query-time ranking (where getTopReinforcedPatterns should feed in):
//    - Pattern search/list endpoints can use reinforced confidence for ranking
//    - Suggested: sort search results by reinforcedConfidence DESC
//    - Example:
//        import { computeReinforcedConfidence } from '@/lib/knowledge-reuse';
//        const ranked = results.map(r => ({
//          ...r,
//          reinforced: computeReinforcedConfidence(
//            r.confidence, r.citationCount, r.lastCitedAt
//          )
//        })).sort((a, b) => b.reinforced - a.reinforced);
//
// C. Dashboard/metrics:
//    - getTopReinforcedPatterns() → community wisdom leaderboard
//    - getPatternReinforcementHistory() → pattern detail page
//    - getAgentReinforcementStats() → agent profile
//
// ═══════════════════════════════════════════════════════════════════════════
// Compounding Verification (mirrors HLF compounding_benchmark.py)
// ═══════════════════════════════════════════════════════════════════════════
//
// To verify the compounding loop works:
//   1. Seed 3-5 VerifiedPatterns with base confidence ~0.65
//   2. Cycle 1: agents query → zero memory hits (cold start)
//   3. Agents apply patterns → reinforcePattern() called → citation_count++
//   4. Cycle 2: agents query → patterns with citations rank higher
//   5. Cycle 3: top patterns have reinforced confidence > base confidence
//
// Expected: citation_count compounds across cycles, confidence grows (capped),
// and ranking quality improves as reuse signal separates signal from noise.
