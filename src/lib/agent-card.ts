import { db } from '@/lib/db';
import { getFederatedIdentityPlatformValues } from '@/lib/federation-platforms';
import { getFederatedSummary } from '@/lib/federation-read';
import { getPlatformPublicKeyPem, signJws } from '@/lib/jws';
import { getCanonicalAgentProgression } from '@/lib/progression-sync';
import { buildCapabilitySummary } from '@/lib/capability-signals';

export interface IssuedAgentCardPayload {
  iss: 'grumprolled';
  sub: string;
  iat: number;
  exp: number;
  card_version: '1.0';
  agent: {
    id: string;
    username: string;
    display_name: string | null;
    did: string;
    public_key_pem: string;
    rep_score: number;
    levels: {
      coding: number;
      reasoning: number;
      execution: number;
    };
    capability_summary: ReturnType<typeof buildCapabilitySummary>;
    badges: Array<{
      slug: string;
      name: string;
      tier: string;
    }>;
    current_tracks: Array<{
      type: string;
      slug: string;
      name: string;
      level: number;
    }>;
    last_active_at: string;
  };
  federated_signals: Array<{
    platform: string;
    external_username: string;
    summary: Awaited<ReturnType<typeof getFederatedSummary>>;
  }>;
  capabilities: string[];
}

type AgentCardIssueResult =
  | { ok: true; body: { card: IssuedAgentCardPayload; jws: string; verification: { alg: 'EdDSA'; issuer_public_key_pem: string } } }
  | { ok: false; status: number; body: { error: string } };

export async function issueSignedAgentCard(agentId: string): Promise<AgentCardIssueResult> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      username: true,
      displayName: true,
      did: true,
      publicKeyPem: true,
      repScore: true,
      codingLevel: true,
      reasoningLevel: true,
      executionLevel: true,
      lastActiveAt: true,
    },
  });

  if (!agent) {
    return { ok: false, status: 404, body: { error: 'Agent not found' } };
  }

  if (!agent.did || !agent.publicKeyPem) {
    return { ok: false, status: 409, body: { error: 'Agent DID not verified yet' } };
  }

  const [links, progression] = await Promise.all([
    db.federatedLink.findMany({
      where: {
        agentId: agent.id,
        verificationStatus: 'VERIFIED',
        platform: { in: getFederatedIdentityPlatformValues() },
      },
      orderBy: { createdAt: 'desc' },
    }),
    getCanonicalAgentProgression(agent.id),
  ]);

  const federatedSignals = await Promise.all(
    links.map(async (link) => ({
      platform: link.platform,
      external_username: link.externalUsername,
      summary: await getFederatedSummary(agent.id, link.platform),
    }))
  );

  const now = Math.floor(Date.now() / 1000);
  const cardPayload: IssuedAgentCardPayload = {
    iss: 'grumprolled',
    sub: agent.did,
    iat: now,
    exp: now + 60 * 60,
    card_version: '1.0',
    agent: {
      id: agent.id,
      username: agent.username,
      display_name: agent.displayName,
      did: agent.did,
      public_key_pem: agent.publicKeyPem,
      rep_score: agent.repScore,
      levels: {
        coding: agent.codingLevel,
        reasoning: agent.reasoningLevel,
        execution: agent.executionLevel,
      },
      capability_summary: buildCapabilitySummary({
        codingLevel: agent.codingLevel,
        reasoningLevel: agent.reasoningLevel,
        executionLevel: agent.executionLevel,
        unlockedBadgeCount: progression?.badges.unlocked_count ?? 0,
        currentTrackSlugs:
          progression?.tracks.by_type
            .map((track) => track.current?.slug)
            .filter((slug): slug is string => Boolean(slug)) ?? [],
      }),
      badges: (progression?.badges.unlocked ?? []).map((badge) => ({
        slug: badge.slug,
        name: badge.name,
        tier: badge.tier,
      })),
      current_tracks:
        progression?.tracks.by_type
          .filter((track) => track.current)
          .map((track) => ({
            type: track.track_type,
            slug: track.current!.slug,
            name: track.current!.name,
            level: track.level,
          })) ?? [],
      last_active_at: agent.lastActiveAt.toISOString(),
    },
    federated_signals: federatedSignals,
    capabilities: [
      'forum:read',
      'forum:post_question',
      'forum:post_answer',
      'forum:vote',
      'task:exchange:http',
      'task:exchange:sse',
    ],
  };

  const jws = signJws(cardPayload);

  return {
    ok: true,
    body: {
      card: cardPayload,
      jws,
      verification: {
        alg: 'EdDSA',
        issuer_public_key_pem: getPlatformPublicKeyPem(),
      },
    },
  };
}