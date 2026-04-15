import { db } from '@/lib/db';
import {
  buildDIDDocument,
  generateChallenge,
  generateDID,
  generateEd25519KeyPair,
  issueDidChallengeToken,
  verifyChallenge,
  verifyDidChallengeToken,
} from '@/lib/did';

export async function getDidDocumentByAgent(options: { agentId?: string; username?: string }) {
  const agent = await db.agent.findUnique({
    where: options.agentId ? { id: options.agentId } : { username: options.username! },
    select: {
      id: true,
      username: true,
      displayName: true,
      did: true,
      publicKeyPem: true,
      didRegisteredAt: true,
      runtimeType: true,
      runtimeEndpoint: true,
    },
  });

  if (!agent) {
    return { status: 404, body: { error: 'Agent not found' } };
  }

  if (!agent.did || !agent.publicKeyPem) {
    return {
      status: 200,
      body: {
        message: 'Agent DID not yet registered',
        agent_id: agent.id,
        username: agent.username,
        can_register: true,
      },
    };
  }

  return {
    status: 200,
    body: {
      agent_id: agent.id,
      username: agent.username,
      display_name: agent.displayName,
      did_document: buildDIDDocument(agent.did, agent.publicKeyPem),
      registered_at: agent.didRegisteredAt?.toISOString() ?? null,
      runtime: {
        type: agent.runtimeType,
        endpoint: agent.runtimeEndpoint,
      },
    },
  };
}

export async function registerDidForAgent(agentId: string) {
  const existing = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, did: true, publicKeyPem: true, didRegisteredAt: true },
  });

  if (!existing) {
    return { status: 404, body: { error: 'Agent not found' } };
  }

  if (existing.did && existing.publicKeyPem && existing.didRegisteredAt) {
    return {
      status: 200,
      body: {
        message: 'Agent DID already registered',
        did: existing.did,
        registered_at: existing.didRegisteredAt.toISOString(),
        did_document: buildDIDDocument(existing.did, existing.publicKeyPem),
      },
    };
  }

  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
  const did = generateDID(publicKeyPem);
  const challenge = generateChallenge();
  const { token, expiresAt } = issueDidChallengeToken(agentId, did, challenge);

  await db.agent.update({
    where: { id: agentId },
    data: {
      did,
      publicKeyPem,
      challengeSig: null,
      didRegisteredAt: null,
      isVerified: false,
    },
  });

  return {
    status: 201,
    body: {
      did,
      public_key_pem: publicKeyPem,
      private_key_pem: privateKeyPem,
      challenge,
      challenge_token: token,
      expires_at: expiresAt,
      algorithm: 'Ed25519',
      message: 'DID key pair created. Sign the challenge with the returned private key and submit it to verify ownership.',
      next_endpoint: `/api/v1/agents/${agentId}/did/verify`,
    },
  };
}

export async function verifyDidForAgent(agentId: string, challengeToken: string, challengeSignature: string) {
  const challengePayload = verifyDidChallengeToken(challengeToken);
  if (!challengePayload) {
    return { status: 400, body: { error: 'Invalid or expired challenge_token' } };
  }
  if (challengePayload.agentId !== agentId) {
    return { status: 403, body: { error: 'Challenge token does not belong to this agent' } };
  }

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, did: true, publicKeyPem: true, didRegisteredAt: true },
  });

  if (!agent?.did || !agent.publicKeyPem) {
    return {
      status: 400,
      body: {
        error: 'Agent DID not found or not ready for verification',
        message: 'Call POST /api/v1/agents/{id}/did/register first',
      },
    };
  }

  if (agent.did !== challengePayload.did) {
    return { status: 409, body: { error: 'DID mismatch between challenge token and stored agent record' } };
  }

  if (!verifyChallenge(challengePayload.challenge, challengeSignature, agent.publicKeyPem)) {
    return { status: 403, body: { error: 'Challenge signature verification failed' } };
  }

  const updated = await db.agent.update({
    where: { id: agentId },
    data: {
      challengeSig: challengeSignature,
      didRegisteredAt: agent.didRegisteredAt ?? new Date(),
      isVerified: true,
    },
    select: {
      did: true,
      publicKeyPem: true,
      didRegisteredAt: true,
      isVerified: true,
    },
  });

  return {
    status: 200,
    body: {
      message: 'DID verification successful',
      did: updated.did,
      is_verified: updated.isVerified,
      registered_at: updated.didRegisteredAt?.toISOString() ?? null,
      did_document: buildDIDDocument(updated.did!, updated.publicKeyPem!),
    },
  };
}