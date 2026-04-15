export type SourceTier = 'S' | 'A' | 'B' | 'C';

export interface ConfidenceInputs {
  factCheckScore?: number;
  executionScore?: number;
  citationScore?: number;
  expertScore?: number;
  communityScore?: number;
  sourceTier: SourceTier;
}

const TIER_WEIGHT: Record<SourceTier, number> = {
  S: 1.0,
  A: 0.8,
  B: 0.6,
  C: 0.4,
};

export const KNOWLEDGE_PUBLISH_CONFIDENCE_MIN = 0.65;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function classifySourceTier(input: {
  sourceRepo?: string | null;
  sourcePath?: string | null;
  sourceUrl?: string | null;
  isOfficial?: boolean;
}): SourceTier {
  const repo = (input.sourceRepo || '').toLowerCase();
  const path = (input.sourcePath || '').toLowerCase();
  const url = (input.sourceUrl || '').toLowerCase();

  if (input.isOfficial) return 'S';
  if (url.includes('rfc') || url.includes('docs.python.org') || url.includes('webassembly.org')) {
    return 'S';
  }
  if (repo.includes('hlf_mcp') || repo.includes('sovereign_agentic_os_with_hlf')) {
    return 'A';
  }
  if (repo.includes('browseros-workflow-knowledge') || path.includes('status') || path.includes('report')) {
    return 'B';
  }

  return 'C';
}

export function computeConfidence(input: ConfidenceInputs): number {
  const fact = clamp01(input.factCheckScore ?? 0.5);
  const exec = clamp01(input.executionScore ?? 0.5);
  const cite = clamp01(input.citationScore ?? 0.5);
  const expert = clamp01(input.expertScore ?? 0.5);
  const community = clamp01(input.communityScore ?? 0.5);

  const validity =
    fact * 0.3 +
    exec * 0.25 +
    cite * 0.2 +
    expert * 0.15 +
    community * 0.1;

  return Math.round(clamp01(validity * TIER_WEIGHT[input.sourceTier]) * 1000) / 1000;
}

export function isVerificationEligible(confidence: number): boolean {
  return confidence >= KNOWLEDGE_PUBLISH_CONFIDENCE_MIN;
}

export function isPublishable(
  validationStatus: string,
  confidence: number,
  publishedAt?: Date | string | null
): boolean {
  return (
    validationStatus === 'VERIFIED' &&
    isVerificationEligible(confidence) &&
    Boolean(publishedAt)
  );
}

export function isPublicPatternCandidate(input: {
  validationStatus: string;
  confidence: number;
  publishedAt?: Date | string | null;
  deprecatedAt?: Date | string | null;
}): boolean {
  return !input.deprecatedAt && isPublishable(input.validationStatus, input.confidence, input.publishedAt);
}
