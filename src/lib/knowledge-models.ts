// ── Model Certification Provenance ─────────────────────────────────────────────
// Extends grumprolled's source-tier classification with HLF model certification
// provenance. A model that has proven itself reliable in the HLF ecosystem
// (via compile-success rates, prompt fluency, etc.) receives tier adjustments
// and confidence multipliers when its outputs are ingested as knowledge patterns.
//
// Integration points:
//   - classifyModelTier() wraps classifySourceTier() from knowledge.ts
//   - computeModelAdjustedConfidence() wraps computeConfidence() from knowledge.ts
//   - Patterns weave modelProvenance into their provenance JSON field
//   - external-ingest.ts can set model provenance from source metadata

import { classifySourceTier, computeConfidence, type SourceTier } from '@/lib/knowledge';

// ── Certification level ────────────────────────────────────────────────────────

export type CertificationLevel = 'CERTIFIED' | 'PROMISING' | 'UNVERIFIED' | 'DEPRECATED';

/** Human-readable descriptions for each certification tier. */
export const CERTIFICATION_LEVEL_DESCRIPTIONS: Record<CertificationLevel, string> = {
  CERTIFIED:
    'Fully vetted, production-ready. Achieved >= 80% HLF compile-success rate ' +
    'across the standard certification prompt suite.',
  PROMISING:
    'Shows good results but is still under evaluation. Pass rate between 50-79% ' +
    'or limited sample size.',
  UNVERIFIED:
    'Unknown or newly discovered model. No certification data available yet.',
  DEPRECATED:
    'No longer trusted. Previously certified but has since been revoked due ' +
    'to poor performance, obsolescence, or policy violation.',
};

// ── Model certification ────────────────────────────────────────────────────────

export interface ModelCertification {
  modelName: string;
  provider: string;
  certificationLevel: CertificationLevel;
  certifiedAt: Date;
  expiresAt: Date | null;
  capabilities: string[];
  /** HLF compile-success rate from last certification run (0.0 - 1.0). */
  compileSuccessRate?: number;
  /** Average latency from last certification run. */
  avgLatencyS?: number;
  /** Reason for deprecation (only set when level is DEPRECATED). */
  deprecationReason?: string | null;
}

// ── Model provenance entry ─────────────────────────────────────────────────────

export interface ModelProvenanceEntry {
  modelCertification: ModelCertification;
  usageStats: ModelUsageStats;
}

export interface ModelUsageStats {
  patternsProduced: number;
  avgConfidence: number;
  contradictionCount: number;
  communityFeedback: number; // -1.0 to 1.0 aggregate sentiment
}

// ── Model provenance report ────────────────────────────────────────────────────

export interface ModelProvenanceReport {
  modelName: string;
  provider: string;
  certificationLevel: CertificationLevel;
  patternsCount: number;
  avgConfidence: number;
  recommendation: 'PRIMARY' | 'FALLBACK' | 'EVALUATE' | 'AVOID';
}

// ── Tier bump/pentalty constants ───────────────────────────────────────────────

const TIER_ORDER: SourceTier[] = ['S', 'A', 'B', 'C'];

function bumpTier(tier: SourceTier, delta: number): SourceTier {
  const idx = TIER_ORDER.indexOf(tier);
  const newIdx = Math.max(0, Math.min(TIER_ORDER.length - 1, idx + delta));
  return TIER_ORDER[newIdx];
}

// ── Model classification ───────────────────────────────────────────────────────

export interface ModelTierInput {
  modelName: string;
  provider?: string;
  sourceRepo?: string | null;
  sourcePath?: string | null;
  sourceUrl?: string | null;
  isOfficial?: boolean;
}

/**
 * Classify a source into an S/A/B/C tier, then adjust based on the model's
 * certification provenance.
 *
 * Adjustments:
 *   CERTIFIED   → +1 tier bump (B → A, A → S; S stays S)
 *   PROMISING   → no adjustment
 *   UNVERIFIED  → -1 tier penalty (S → A, A → B, B → C; C stays C)
 *   DEPRECATED  → C tier maximum, regardless of other signals
 */
export function classifyModelTier(input: ModelTierInput): SourceTier {
  const baseTier = classifySourceTier({
    sourceRepo: input.sourceRepo,
    sourcePath: input.sourcePath,
    sourceUrl: input.sourceUrl,
    isOfficial: input.isOfficial,
  });

  const cert = modelRegistry.get(input.modelName.toLowerCase());

  if (!cert) {
    // Unknown model → UNVERIFIED penalty
    return bumpTier(baseTier, -1);
  }

  switch (cert.certificationLevel) {
    case 'CERTIFIED':
      return bumpTier(baseTier, 1);
    case 'PROMISING':
      return baseTier;
    case 'UNVERIFIED':
      return bumpTier(baseTier, -1);
    case 'DEPRECATED':
      return 'C';
    default:
      return baseTier;
  }
}

// ── Confidence adjustment ──────────────────────────────────────────────────────

/**
 * Compute a confidence score adjusted by model certification provenance.
 *
 * Multipliers:
 *   CERTIFIED  → baseConfidence × 1.10 (capped at 1.0)
 *   PROMISING  → baseConfidence × 1.00 (no adjustment)
 *   UNVERIFIED → baseConfidence × 0.85
 *   DEPRECATED → baseConfidence × 0.60
 */
export function computeModelAdjustedConfidence(
  baseConfidence: number,
  modelName: string,
): number {
  const cert = modelRegistry.get(modelName.toLowerCase());
  if (!cert) return clamp01(baseConfidence * 0.85); // treat unknown as UNVERIFIED

  switch (cert.certificationLevel) {
    case 'CERTIFIED':
      return clamp01(baseConfidence * 1.1);
    case 'PROMISING':
      return clamp01(baseConfidence);
    case 'UNVERIFIED':
      return clamp01(baseConfidence * 0.85);
    case 'DEPRECATED':
      return clamp01(baseConfidence * 0.6);
    default:
      return clamp01(baseConfidence);
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 1000) / 1000;
}

// ── Default certified models ───────────────────────────────────────────────────
// Models that have proven reliable in the grumprolled ecosystem through repeated
// certification runs. These are trusted defaults; the registry can be extended
// at runtime via registerModel().

export const DEFAULT_CERTIFIED_MODELS: ModelCertification[] = [
  {
    modelName: 'claude-sonnet-4-20250514',
    provider: 'ANTHROPIC',
    certificationLevel: 'CERTIFIED',
    certifiedAt: new Date('2025-05-14T00:00:00Z'),
    expiresAt: null,
    capabilities: ['hlf-v3-compile', 'code-generation', 'reasoning', 'spec-gates'],
    compileSuccessRate: 0.95,
    avgLatencyS: 1.8,
  },
  {
    modelName: 'gpt-4o',
    provider: 'OPENAI',
    certificationLevel: 'CERTIFIED',
    certifiedAt: new Date('2025-01-15T00:00:00Z'),
    expiresAt: null,
    capabilities: ['hlf-v3-compile', 'code-generation', 'reasoning', 'prompt-fidelity'],
    compileSuccessRate: 0.92,
    avgLatencyS: 1.2,
  },
  {
    modelName: 'deepseek-v4-pro',
    provider: 'DEEPSEEK',
    certificationLevel: 'CERTIFIED',
    certifiedAt: new Date('2025-04-01T00:00:00Z'),
    expiresAt: null,
    capabilities: ['hlf-v3-compile', 'code-generation', 'constraint-solving'],
    compileSuccessRate: 0.88,
    avgLatencyS: 2.1,
  },
  {
    modelName: 'kimi-k2.5:cloud',
    provider: 'KIMI',
    certificationLevel: 'PROMISING',
    certifiedAt: new Date('2025-03-20T00:00:00Z'),
    expiresAt: new Date('2025-09-20T00:00:00Z'),
    capabilities: ['hlf-v3-compile', 'reasoning'],
    compileSuccessRate: 0.72,
    avgLatencyS: 2.8,
  },
  {
    modelName: 'qwen3:14b',
    provider: 'OLLAMA',
    certificationLevel: 'PROMISING',
    certifiedAt: new Date('2025-02-10T00:00:00Z'),
    expiresAt: new Date('2025-08-10T00:00:00Z'),
    capabilities: ['hlf-v3-compile', 'constraint-solving'],
    compileSuccessRate: 0.65,
    avgLatencyS: 3.4,
  },
];

// ── In-memory model registry ───────────────────────────────────────────────────
// Backed by a Map; callers can seed it from DEFAULT_CERTIFIED_MODELS and then
// mutate at runtime. In production this should be backed by the database model
// described at the bottom of this file.

export const modelRegistry = new Map<string, ModelCertification>();

/** Seed the registry with default certified models. */
export function seedModelRegistry(models?: ModelCertification[]): void {
  const seed = models ?? DEFAULT_CERTIFIED_MODELS;
  for (const m of seed) {
    modelRegistry.set(m.modelName.toLowerCase(), { ...m });
  }
}

/**
 * Register or update a model certification in the registry.
 * Returns the updated certification entry.
 */
export function registerModel(cert: ModelCertification): ModelCertification {
  const key = cert.modelName.toLowerCase();
  const existing = modelRegistry.get(key);
  const merged: ModelCertification = {
    ...existing,
    ...cert,
    modelName: cert.modelName, // preserve original casing from latest registration
  };
  modelRegistry.set(key, merged);
  return merged;
}

/**
 * Mark a model as DEPRECATED with a reason.
 * Returns the updated certification entry, or null if the model was not found.
 */
export function deprecateModel(
  modelName: string,
  reason: string,
): ModelCertification | null {
  const key = modelName.toLowerCase();
  const existing = modelRegistry.get(key);
  if (!existing) return null;

  const deprecated: ModelCertification = {
    ...existing,
    certificationLevel: 'DEPRECATED',
    deprecationReason: reason,
    expiresAt: new Date(), // deprecated immediately
  };
  modelRegistry.set(key, deprecated);
  return deprecated;
}

/**
 * Look up a model's certification status.
 */
export function getModelCertification(
  modelName: string,
): ModelCertification | undefined {
  return modelRegistry.get(modelName.toLowerCase());
}

/**
 * Check whether a model is currently trusted (CERTIFIED and not expired).
 */
export function isModelTrusted(modelName: string): boolean {
  const cert = modelRegistry.get(modelName.toLowerCase());
  if (!cert || cert.certificationLevel !== 'CERTIFIED') return false;
  if (cert.expiresAt && cert.expiresAt < new Date()) return false;
  return true;
}

// ── Aggregate stats ────────────────────────────────────────────────────────────

export interface ModelAggregateStats {
  modelName: string;
  provider: string;
  certificationLevel: CertificationLevel;
  patternsProduced: number;
  avgConfidence: number;
  deprecationRate: number; // fraction of models deprecated in this family
  contradictionCount: number;
  communityFeedback: number;
}

/**
 * Compute aggregate stats across the model registry.
 * In production this would query the database; the in-memory version works
 * against the registry plus an optional set of provenance entries.
 */
export function getModelStats(
  provenances?: ModelProvenanceEntry[],
): ModelAggregateStats[] {
  const stats: ModelAggregateStats[] = [];

  for (const [key, cert] of modelRegistry) {
    const entries = (provenances ?? []).filter(
      (p) => p.modelCertification.modelName.toLowerCase() === key,
    );

    const patternsProduced = entries.reduce(
      (sum, e) => sum + e.usageStats.patternsProduced,
      0,
    );
    const totalConfidence = entries.reduce(
      (sum, e) => sum + e.usageStats.avgConfidence * e.usageStats.patternsProduced,
      0,
    );
    const avgConfidence =
      patternsProduced > 0 ? totalConfidence / patternsProduced : 0;
    const contradictionCount = entries.reduce(
      (sum, e) => sum + e.usageStats.contradictionCount,
      0,
    );
    const totalFeedback = entries.reduce(
      (sum, e) => sum + e.usageStats.communityFeedback,
      0,
    );
    const communityFeedback =
      entries.length > 0 ? totalFeedback / entries.length : 0;

    // Deprecation rate across all models from the same provider
    const providerModels = [...modelRegistry.values()].filter(
      (m) => m.provider === cert.provider,
    );
    const deprecatedCount = providerModels.filter(
      (m) => m.certificationLevel === 'DEPRECATED',
    ).length;
    const deprecationRate =
      providerModels.length > 0 ? deprecatedCount / providerModels.length : 0;

    stats.push({
      modelName: cert.modelName,
      provider: cert.provider,
      certificationLevel: cert.certificationLevel,
      patternsProduced,
      avgConfidence: Math.round(avgConfidence * 1000) / 1000,
      deprecationRate: Math.round(deprecationRate * 1000) / 1000,
      contradictionCount,
      communityFeedback: Math.round(communityFeedback * 1000) / 1000,
    });
  }

  return stats.sort((a, b) => b.patternsProduced - a.patternsProduced);
}

// ── Report generation ──────────────────────────────────────────────────────────

/**
 * Generate a provenance report for a specific model.
 */
export function generateModelProvenanceReport(
  modelName: string,
  provenances?: ModelProvenanceEntry[],
): ModelProvenanceReport | null {
  const cert = modelRegistry.get(modelName.toLowerCase());
  if (!cert) return null;

  const entries = (provenances ?? []).filter(
    (p) => p.modelCertification.modelName.toLowerCase() === modelName.toLowerCase(),
  );

  const patternsCount = entries.reduce(
    (sum, e) => sum + e.usageStats.patternsProduced,
    0,
  );
  const totalConfidence = entries.reduce(
    (sum, e) => sum + e.usageStats.avgConfidence * e.usageStats.patternsProduced,
    0,
  );
  const avgConfidence =
    patternsCount > 0
      ? Math.round((totalConfidence / patternsCount) * 1000) / 1000
      : 0;

  let recommendation: ModelProvenanceReport['recommendation'];
  switch (cert.certificationLevel) {
    case 'CERTIFIED':
      recommendation = 'PRIMARY';
      break;
    case 'PROMISING':
      recommendation = avgConfidence >= 0.7 ? 'FALLBACK' : 'EVALUATE';
      break;
    case 'UNVERIFIED':
      recommendation = 'EVALUATE';
      break;
    case 'DEPRECATED':
      recommendation = 'AVOID';
      break;
    default:
      recommendation = 'EVALUATE';
  }

  return {
    modelName: cert.modelName,
    provider: cert.provider,
    certificationLevel: cert.certificationLevel,
    patternsCount,
    avgConfidence,
    recommendation,
  };
}

/**
 * Generate provenance reports for all registered models.
 */
export function generateAllModelProvenanceReports(
  provenances?: ModelProvenanceEntry[],
): ModelProvenanceReport[] {
  const reports: ModelProvenanceReport[] = [];
  for (const [name] of modelRegistry) {
    const report = generateModelProvenanceReport(name, provenances);
    if (report) reports.push(report);
  }
  return reports.sort((a, b) => {
    const priority: Record<string, number> = {
      PRIMARY: 0,
      FALLBACK: 1,
      EVALUATE: 2,
      AVOID: 3,
    };
    return (priority[a.recommendation] ?? 99) - (priority[b.recommendation] ?? 99);
  });
}

// ── Initialization ─────────────────────────────────────────────────────────────
// Seed the registry with defaults on module load so callers don't need to
// remember to call seedModelRegistry().

seedModelRegistry();

// ── Prisma schema changes ──────────────────────────────────────────────────────
//
// Add this model to schema.prisma to persist model certifications:
//
//   model ModelCertification {
//     id                 String   @id @default(cuid())
//     modelName          String
//     provider           String
//     certificationLevel String   @default("UNVERIFIED") // CERTIFIED, PROMISING, UNVERIFIED, DEPRECATED
//     certifiedAt        DateTime @default(now())
//     expiresAt          DateTime?
//     capabilities       String   @default("[]") // JSON array
//     compileSuccessRate Float?
//     avgLatencyS        Float?
//     deprecationReason  String?
//
//     patterns ModelProvenance[]
//
//     createdAt DateTime @default(now())
//     updatedAt DateTime @updatedAt
//
//     @@unique([modelName, provider])
//     @@index([certificationLevel])
//     @@index([provider])
//   }
//
//   model ModelProvenance {
//     id                  String   @id @default(cuid())
//     modelCertificationId String
//     patternId           String
//     confidence          Float    @default(0)
//     patternsProduced    Int      @default(0)
//     avgConfidence       Float    @default(0)
//     contradictionCount  Int      @default(0)
//     communityFeedback   Float    @default(0)
//
//     modelCertification ModelCertification @relation(fields: [modelCertificationId], references: [id], onDelete: Cascade)
//     pattern            VerifiedPattern    @relation(fields: [patternId], references: [id], onDelete: Cascade)
//
//     @@unique([modelCertificationId, patternId])
//     @@index([patternId])
//   }
//
// Extend VerifiedPattern.provenance to include modelProvenance:
//   When a model produces a pattern, merge into the provenance JSON:
//   {
//     ...existing,
//     modelProvenance: {
//       modelName: "...",
//       provider: "...",
//       certificationLevel: "...",
//       adjustedConfidence: <number>,
//       tierAdjustment: "<+1 | -1 | 0 | C>",
//     }
//   }
