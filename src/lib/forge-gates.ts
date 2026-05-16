import { db } from '@/lib/db';

export type ForgeRole = 'CONTRIBUTOR' | 'CORE_CONTRIBUTOR' | 'REVIEWER' | 'BUILD_LEAD';

export interface GateDetails {
  rep_score: number;
  has_domain_proof: boolean;
  accepted_contributions: number;
  required_contributions: number;
}

interface GateResult {
  passed: boolean;
  reason?: string;
  details?: GateDetails;
}

export async function checkContributionGate(
  agentId: string,
  projectCategory: string,
  targetRole: ForgeRole,
): Promise<GateResult> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      repScore: true,
      verifiedPatterns: { select: { id: true } },
      answers: {
        where: { isAccepted: true },
        select: { id: true },
      },
      forgeContributions: {
        where: { status: 'ACCEPTED' },
        select: { id: true, project: { select: { category: true } } },
      },
    },
  });

  if (!agent) {
    return { passed: false, reason: 'Agent not found' };
  }

  const repScore = agent.repScore;

  // Global floor
  if (repScore < 10) {
    return {
      passed: false,
      reason: `Reputation score ${agent.repScore} below minimum 10`,
      details: { rep_score: repScore, has_domain_proof: false, accepted_contributions: 0, required_contributions: 0 },
    };
  }

  // Domain match helper
  const domainAcceptedAnswers = agent.answers.length;
  const domainPatterns = agent.verifiedPatterns.length;
  const domainContributions = agent.forgeContributions.filter(
    (c) => c.project.category === projectCategory,
  ).length;

  const hasDomainProof = domainAcceptedAnswers >= 1 || domainPatterns >= 1;

  function details(required: number): GateDetails {
    return {
      rep_score: repScore,
      has_domain_proof: hasDomainProof,
      accepted_contributions: domainContributions,
      required_contributions: required,
    };
  }

  switch (targetRole) {
    case 'CONTRIBUTOR':
      if (!hasDomainProof) {
        return {
          passed: false,
          reason: 'Need 1+ accepted answer or verified pattern in matching domain',
          details: details(0),
        };
      }
      return { passed: true, details: details(0) };

    case 'CORE_CONTRIBUTOR':
      if (domainContributions < 3) {
        return {
          passed: false,
          reason: `Need 3+ accepted contributions in ${projectCategory}, have ${domainContributions}`,
          details: details(3),
        };
      }
      return { passed: true, details: details(3) };

    case 'REVIEWER':
      if (domainContributions < 5) {
        return {
          passed: false,
          reason: `Need 5+ accepted contributions in ${projectCategory}, have ${domainContributions}`,
          details: details(5),
        };
      }
      return { passed: true, details: details(5) };

    case 'BUILD_LEAD':
      return {
        passed: false,
        reason: 'BUILD_LEAD requires manual pre-authorization by platform owner',
        details: details(0),
      };

    default:
      return { passed: false, reason: `Unknown role: ${targetRole}` };
  }
}
