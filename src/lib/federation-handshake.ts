import { db } from '@/lib/db';
import { issueSignedAgentCard, type IssuedAgentCardPayload } from '@/lib/agent-card';
import { decodeJwsPayload, getPlatformPublicKeyPem, signJws, verifyJws } from '@/lib/jws';
import { isFederatedIdentityPlatform } from '@/lib/federation-platforms';

export interface FederationHandshakePayload {
  iss: 'grumprolled-federation';
  sub: string;
  iat: number;
  exp: number;
  handshake_version: '1.0';
  platform: 'CHATOVERFLOW' | 'MOLTBOOK';
  agent: {
    id: string;
    username: string;
    did: string;
  };
  verified_link: {
    external_username: string;
    external_profile_url: string | null;
    verified_at: string | null;
  };
  signed_card_jws: string;
  capabilities: string[];
}

interface FederationHandshakeVerificationResult {
  valid: boolean;
  checks: Record<string, boolean>;
  payload: FederationHandshakePayload | null;
  signed_card: IssuedAgentCardPayload | null;
  verification: {
    alg: 'EdDSA';
    issuer_public_key_pem: string;
  };
}

type FederationHandshakeIssueResult =
  | {
      ok: true;
      body: {
        handshake: FederationHandshakePayload;
        jws: string;
        signed_card: ReturnType<Extract<Awaited<ReturnType<typeof issueSignedAgentCard>>, { ok: true }>['body']>;
        verification: { alg: 'EdDSA'; issuer_public_key_pem: string };
      };
    }
  | { ok: false; status: number; body: { error: string } };

export async function issueFederationHandshake(
  agentId: string,
  platform: string
): Promise<FederationHandshakeIssueResult> {
  const normalizedPlatform = platform.toUpperCase();
  if (!isFederatedIdentityPlatform(normalizedPlatform)) {
    return { ok: false, status: 409, body: { error: 'Platform does not support signed-card federation handshakes.' } };
  }

  const link = await db.federatedLink.findUnique({
    where: { agentId_platform: { agentId, platform: normalizedPlatform } },
    select: {
      platform: true,
      externalUsername: true,
      externalProfileUrl: true,
      verificationStatus: true,
      verifiedAt: true,
    },
  });

  if (!link) {
    return { ok: false, status: 404, body: { error: 'Federated link not found.' } };
  }

  if (link.verificationStatus !== 'VERIFIED') {
    return { ok: false, status: 409, body: { error: 'Federated link must be verified before a handshake can be issued.' } };
  }

  const signedCard = await issueSignedAgentCard(agentId);
  if (!signedCard.ok) {
    return signedCard;
  }

  const now = Math.floor(Date.now() / 1000);
  const handshake: FederationHandshakePayload = {
    iss: 'grumprolled-federation',
    sub: signedCard.body.card.agent.did,
    iat: now,
    exp: now + 15 * 60,
    handshake_version: '1.0',
    platform: normalizedPlatform,
    agent: {
      id: signedCard.body.card.agent.id,
      username: signedCard.body.card.agent.username,
      did: signedCard.body.card.agent.did,
    },
    verified_link: {
      external_username: link.externalUsername,
      external_profile_url: link.externalProfileUrl,
      verified_at: link.verifiedAt?.toISOString() ?? null,
    },
    signed_card_jws: signedCard.body.jws,
    capabilities: ['federation:handshake', 'federation:verified-link', 'trust:signed-card'],
  };

  const jws = signJws(handshake, `grumprolled-federation-${normalizedPlatform.toLowerCase()}-v1`);

  return {
    ok: true,
    body: {
      handshake,
      jws,
      signed_card: signedCard.body,
      verification: {
        alg: 'EdDSA',
        issuer_public_key_pem: getPlatformPublicKeyPem(),
      },
    },
  };
}

export function verifyFederationHandshake(
  token: string,
  expectedPlatform?: string
): FederationHandshakeVerificationResult {
  const signatureValid = verifyJws(token);
  const payload = signatureValid ? decodeJwsPayload<FederationHandshakePayload>(token) : null;
  const signedCardSignatureValid = Boolean(payload?.signed_card_jws) && verifyJws(payload!.signed_card_jws);
  const signedCardPayload = signedCardSignatureValid
    ? decodeJwsPayload<IssuedAgentCardPayload>(payload!.signed_card_jws)
    : null;
  const now = Math.floor(Date.now() / 1000);
  const normalizedExpectedPlatform = expectedPlatform?.toUpperCase();

  const checks = {
    signature_valid: signatureValid,
    payload_decodable: Boolean(payload),
    issuer_valid: payload?.iss === 'grumprolled-federation',
    not_expired: typeof payload?.exp === 'number' ? payload.exp > now : false,
    platform_supported: Boolean(payload?.platform) && isFederatedIdentityPlatform(payload!.platform),
    expected_platform_match: normalizedExpectedPlatform ? payload?.platform === normalizedExpectedPlatform : true,
    verified_link_present: Boolean(payload?.verified_link?.external_username && payload?.verified_link?.verified_at),
    signed_card_present: Boolean(payload?.signed_card_jws),
    signed_card_signature_valid: signedCardSignatureValid,
    signed_card_payload_decodable: Boolean(signedCardPayload),
    signed_card_issuer_valid: signedCardPayload?.iss === 'grumprolled',
    signed_card_subject_matches_handshake: Boolean(signedCardPayload?.sub) && signedCardPayload?.sub === payload?.sub,
    signed_card_agent_matches_handshake:
      Boolean(signedCardPayload?.agent?.id) &&
      signedCardPayload?.agent.id === payload?.agent.id &&
      signedCardPayload?.agent.did === payload?.agent.did,
  };

  const valid = Object.values(checks).every(Boolean);

  return {
    valid,
    checks,
    payload,
    signed_card: signedCardPayload,
    verification: {
      alg: 'EdDSA',
      issuer_public_key_pem: getPlatformPublicKeyPem(),
    },
  };
}