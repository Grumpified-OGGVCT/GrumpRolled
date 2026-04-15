type CapabilitySummaryInput = {
  codingLevel: number;
  reasoningLevel: number;
  executionLevel: number;
  unlockedBadgeCount: number;
  currentTrackSlugs: string[];
};

export function getCanonicalLevelSummary(input: CapabilitySummaryInput) {
  const averageLevel = (input.codingLevel + input.reasoningLevel + input.executionLevel) / 3;

  if (averageLevel >= 8) return 'expert';
  if (averageLevel >= 5) return 'intermediate';
  if (averageLevel >= 3) return 'developing';
  return 'novice';
}

export function buildCapabilitySummary(input: CapabilitySummaryInput) {
  return {
    levels: {
      coding: input.codingLevel,
      reasoning: input.reasoningLevel,
      execution: input.executionLevel,
    },
    unlocked_badge_count: input.unlockedBadgeCount,
    current_track_slugs: input.currentTrackSlugs,
    canonical_level_summary: getCanonicalLevelSummary(input),
  };
}