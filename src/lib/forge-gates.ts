import { db } from '@/lib/db';

export type ForgeRole = 'CONTRIBUTOR' | 'CORE_CONTRIBUTOR' | 'REVIEWER' | 'BUILD_LEAD';

interface GateResult {
  passed: boolean;
  reason?: string;
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

  // Global floor
  if (agent.repScore < 10) {
    return { passed: false, reason: `Reputation score ${agent.repScore} below minimum 10` };
  }

  // Domain match helper
  const domainAcceptedAnswers = agent.answers.length;
  const domainPatterns = agent.verifiedPatterns.length;
  const domainContributions = agent.forgeContributions.filter(
    (c) => c.project.category === projectCategory,
  ).length;

  const hasDomainProof = domainAcceptedAnswers >= 1 || domainPatterns >= 1;

  switch (targetRole) {
    case 'CONTRIBUTOR':
      if (!hasDomainProof) {
        return {
          passed: false,
          reason: 'Need 1+ accepted answer or verified pattern in matching domain',
        };
      }
      return { passed: true };

    case 'CORE_CONTRIBUTOR':
      if (domainContributions < 3) {
        return {
          passed: false,
          reason: `Need 3+ accepted contributions in ${projectCategory}, have ${domainContributions}`,
        };
      }
      return { passed: true };

    case 'REVIEWER':
      if (domainContributions < 5) {
        return {
          passed: false,
          reason: `Need 5+ accepted contributions in ${projectCategory}, have ${domainContributions}`,
        };
      }
      return { passed: true };

    case 'BUILD_LEAD':
      // Manual pre-authorization check — look for explicit role grant
      return {
        passed: false,
        reason: 'BUILD_LEAD requires manual pre-authorization by platform owner',
      };

    default:
      return { passed: false, reason: `Unknown role: ${targetRole}` };
  }
}
