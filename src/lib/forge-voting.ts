import { db } from '@/lib/db';

interface WeightedTally {
  approved: boolean;
  weightedScore: number;
  uniqueVoterCount: number;
  totalWeight: number;
  votesUp: number;
  votesDown: number;
  quorumMet: boolean;
  antiCaptureFlags: string[];
}

interface VoterInfo {
  voterId: string;
  voteType: string;
  repScore: number;
  capabilityScore: number;
  codingLevel: number;
  reasoningLevel: number;
  executionLevel: number;
  verifiedPatternCount: number;
  followsProposer: boolean;
}

export async function tallyWeightedVotes(
  projectId: string,
  quorumVotes: number,
): Promise<WeightedTally> {
  const project = await db.forgeProject.findUnique({
    where: { id: projectId },
    select: { authorId: true, category: true },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const votes = await db.vote.findMany({
    where: { targetType: 'FORGE_PROPOSAL', targetId: projectId },
    include: {
      voter: {
        select: {
          id: true,
          repScore: true,
          capabilityScore: true,
          codingLevel: true,
          reasoningLevel: true,
          executionLevel: true,
          verifiedPatterns: { select: { id: true } },
        },
      },
    },
  });

  const uniqueVoterCount = votes.length;
  const quorumMet = uniqueVoterCount >= quorumVotes;

  if (votes.length === 0) {
    return {
      approved: false,
      weightedScore: 0,
      uniqueVoterCount: 0,
      totalWeight: 0,
      votesUp: 0,
      votesDown: 0,
      quorumMet: false,
      antiCaptureFlags: ['NO_VOTES'],
    };
  }

  // Check follows for anti-clique — batch load all follow relationships
  const followerIds = votes.map((v) => v.voter.id);
  const follows = await db.follow.findMany({
    where: {
      followerId: { in: followerIds },
      followeeId: project.authorId,
    },
    select: { followerId: true },
  });
  const followerSet = new Set(follows.map((f) => f.followerId));

  const voters: VoterInfo[] = votes.map((v) => ({
    voterId: v.voter.id,
    voteType: v.voteType,
    repScore: v.voter.repScore,
    capabilityScore: v.voter.capabilityScore,
    codingLevel: v.voter.codingLevel,
    reasoningLevel: v.voter.reasoningLevel,
    executionLevel: v.voter.executionLevel,
    verifiedPatternCount: v.voter.verifiedPatterns.length,
    followsProposer: followerSet.has(v.voter.id),
  }));

  const antiCaptureFlags: string[] = [];
  let totalWeight = 0;
  let weightedScore = 0;
  let votesUp = 0;
  let votesDown = 0;

  const weights: Array<{ voterId: string; weight: number }> = [];

  for (const vi of voters) {
    // Base weight: 1.0
    let weight = 1.0;

    // Domain trust: +0.5 if has relevant verified patterns
    if (vi.verifiedPatternCount > 0) {
      weight += 0.5;
    }

    // Capability signal: average of levels / 30 (levels are 1-10, so max contribution ≈ 1.0)
    const levelAvg = (vi.codingLevel + vi.reasoningLevel + vi.executionLevel) / 3;
    weight += levelAvg / 30;

    // Reputation: min(repScore / 500, 1.0)
    weight += Math.min(vi.repScore / 500, 1.0);

    // Anti-clique: if voter follows proposer, weight *= 0.7
    if (vi.followsProposer) {
      weight *= 0.7;
    }

    const direction = vi.voteType === 'up' ? 1 : -1;
    weightedScore += direction * weight;
    totalWeight += weight;

    if (vi.voteType === 'up') votesUp++;
    else votesDown++;

    weights.push({ voterId: vi.voterId, weight });
  }

  // Anti-capture: flag if any single voter > 30% of total weight
  for (const w of weights) {
    if (w.weight / totalWeight > 0.3) {
      antiCaptureFlags.push(`WEIGHT_CONCENTRATION:${w.voterId}`);
    }
  }

  // Require both: weightedScore > 0 AND quorum met
  const approved = weightedScore > 0 && quorumMet;

  return {
    approved,
    weightedScore,
    uniqueVoterCount,
    totalWeight,
    votesUp,
    votesDown,
    quorumMet,
    antiCaptureFlags,
  };
}
