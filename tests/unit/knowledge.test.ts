import { describe, it, expect } from 'vitest';
import {
  classifySourceTier,
  computeConfidence,
  isPublishable,
  isPublicPatternCandidate,
  isVerificationEligible,
} from '../../src/lib/knowledge';

describe('knowledge tier classification', () => {
  it('returns S when isOfficial flag is set', () => {
    expect(classifySourceTier({ isOfficial: true })).toBe('S');
  });

  it('returns S for trusted standards/docs URLs', () => {
    expect(classifySourceTier({ sourceUrl: 'https://docs.python.org/3/library/typing.html' })).toBe('S');
  });

  it('returns A for HLF repos', () => {
    expect(classifySourceTier({ sourceRepo: 'grumpified/HLF_MCP' })).toBe('A');
  });

  it('returns B for browser workflow/status/report sources', () => {
    expect(classifySourceTier({ sourceRepo: 'browseros-workflow-knowledge' })).toBe('B');
    expect(classifySourceTier({ sourcePath: 'reports/status-overview.md' })).toBe('B');
  });

  it('falls back to C for unknown sources', () => {
    expect(classifySourceTier({ sourceRepo: 'random/repo' })).toBe('C');
  });
});

describe('confidence computation', () => {
  it('clamps values and rounds to 3 decimals', () => {
    const value = computeConfidence({
      sourceTier: 'S',
      factCheckScore: 2,
      executionScore: -1,
      citationScore: 0.3333,
      expertScore: 0.6666,
      communityScore: Number.NaN,
    });

    expect(value).toBe(0.467);
  });

  it('applies tier weighting', () => {
    const sTier = computeConfidence({ sourceTier: 'S', factCheckScore: 1, executionScore: 1, citationScore: 1, expertScore: 1, communityScore: 1 });
    const cTier = computeConfidence({ sourceTier: 'C', factCheckScore: 1, executionScore: 1, citationScore: 1, expertScore: 1, communityScore: 1 });

    expect(sTier).toBe(1);
    expect(cTier).toBe(0.4);
  });
});

describe('publish gate', () => {
  it('requires VERIFIED status, confidence >= 0.65, and explicit publication', () => {
    expect(isVerificationEligible(0.65)).toBe(true);
    expect(isVerificationEligible(0.64)).toBe(false);
    expect(isPublishable('VERIFIED', 0.65, new Date())).toBe(true);
    expect(isPublishable('VERIFIED', 0.65, null)).toBe(false);
    expect(isPublishable('VERIFIED', 0.64, new Date())).toBe(false);
    expect(isPublishable('PENDING', 0.9, new Date())).toBe(false);
  });

  it('requires public patterns to be published and not deprecated', () => {
    expect(
      isPublicPatternCandidate({
        validationStatus: 'VERIFIED',
        confidence: 0.8,
        publishedAt: new Date(),
        deprecatedAt: null,
      })
    ).toBe(true);

    expect(
      isPublicPatternCandidate({
        validationStatus: 'VERIFIED',
        confidence: 0.8,
        publishedAt: null,
        deprecatedAt: null,
      })
    ).toBe(false);

    expect(
      isPublicPatternCandidate({
        validationStatus: 'VERIFIED',
        confidence: 0.8,
        publishedAt: new Date(),
        deprecatedAt: new Date(),
      })
    ).toBe(false);
  });
});
