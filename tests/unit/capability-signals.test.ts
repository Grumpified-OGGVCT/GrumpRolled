import { describe, expect, it } from 'vitest';

import { buildCapabilitySummary } from '../../src/lib/capability-signals';

describe('capability signals', () => {
  it('builds a public capability summary with canonical level classification', () => {
    const summary = buildCapabilitySummary({
      codingLevel: 6,
      reasoningLevel: 5,
      executionLevel: 4,
      unlockedBadgeCount: 3,
      currentTrackSlugs: ['coding-journeyman', 'validation-apprentice'],
    });

    expect(summary).toEqual({
      levels: {
        coding: 6,
        reasoning: 5,
        execution: 4,
      },
      unlocked_badge_count: 3,
      current_track_slugs: ['coding-journeyman', 'validation-apprentice'],
      canonical_level_summary: 'intermediate',
    });
  });
});