import { db } from '@/lib/db';
import { buildCapabilitySummary } from '@/lib/capability-signals';
import { createFullyAwareAgent, type FullyAwareAgent } from '@/lib/agents/fully-aware-agent';
import { createAgentSelfAwareness, type AgentSelfAwareness } from '@/lib/agents/self-awareness';

export const DEFAULT_AGENT_AWARENESS_BASE_URL =
  process.env.GRUMPROLLED_BASE_URL ||
  process.env.GRUMPROLLED_API_BASE ||
  'http://127.0.0.1:4692';

export type AwarenessDbAgent = {
  id: string;
  username: string;
  displayName: string | null;
  repScore: number;
  isResident: boolean;
  codingLevel: number;
  reasoningLevel: number;
  executionLevel: number;
  lastActiveAt: Date;
  _count: { earnedBadges: number };
  upgradeProgress: Array<{ trackSlug: string }>;
};

export type AgentAwarenessContext = {
  agent: AwarenessDbAgent;
  displayName: string;
  role: string;
  capabilitySummary: ReturnType<typeof buildCapabilitySummary>;
  selfAwareness: AgentSelfAwareness;
  fullyAwareAgent: FullyAwareAgent;
};

function inferAgentRole(agent: Pick<AwarenessDbAgent, 'id' | 'username' | 'isResident'>): string {
  const haystack = `${agent.id} ${agent.username}`.toLowerCase();

  if (haystack.includes('search')) return 'search';
  if (haystack.includes('analysis') || haystack.includes('analy')) return 'analysis';
  if (haystack.includes('validat')) return 'validator';
  if (haystack.includes('reput')) return 'reputation';
  if (haystack.includes('moder')) return 'moderator';
  if (haystack.includes('grump') || haystack.includes('core') || agent.isResident) return 'core';
  return 'custom';
}

async function findAgentForAwareness(where: { id?: string }) {
  return db.agent.findUnique({
    where,
    select: {
      id: true,
      username: true,
      displayName: true,
      repScore: true,
      isResident: true,
      codingLevel: true,
      reasoningLevel: true,
      executionLevel: true,
      lastActiveAt: true,
      upgradeProgress: {
        where: { status: { in: ['COMPLETED', 'MASTERED'] } },
        select: { trackSlug: true },
        take: 3,
      },
      _count: {
        select: { earnedBadges: true },
      },
    },
  });
}

export async function getAgentAwarenessContextById(agentId: string): Promise<AgentAwarenessContext | null> {
  const agent = await findAgentForAwareness({ id: agentId });
  if (!agent) {
    return null;
  }

  const displayName = agent.displayName?.trim() || agent.username;
  const role = inferAgentRole(agent);
  const capabilitySummary = buildCapabilitySummary({
    codingLevel: agent.codingLevel,
    reasoningLevel: agent.reasoningLevel,
    executionLevel: agent.executionLevel,
    unlockedBadgeCount: agent._count.earnedBadges,
    currentTrackSlugs: agent.upgradeProgress.map((track) => track.trackSlug),
  });

  return {
    agent,
    displayName,
    role,
    capabilitySummary,
    selfAwareness: createAgentSelfAwareness(agent.id, {
      agentName: displayName,
      role,
    }),
    fullyAwareAgent: createFullyAwareAgent(agent.id, displayName, role, DEFAULT_AGENT_AWARENESS_BASE_URL),
  };
}
