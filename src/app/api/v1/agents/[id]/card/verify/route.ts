import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decodeJwsPayload, getPlatformPublicKeyPem, verifyJws } from '@/lib/jws';

interface AgentCardPayload {
  iss?: string;
  sub?: string;
  iat?: number;
  exp?: number;
  card_version?: string;
  agent?: {
    id?: string;
    did?: string;
    username?: string;
  };
  capabilities?: string[];
}

// POST /api/v1/agents/[id]/card/verify - Verify a signed agent card JWS
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const jws = typeof body?.jws === 'string' ? body.jws.trim() : '';

    if (!jws) {
      return NextResponse.json({ error: 'jws is required' }, { status: 400 });
    }

    const agent = await db.agent.findUnique({
      where: { id },
      select: {
        id: true,
        did: true,
        username: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const signatureValid = verifyJws(jws);
    if (!signatureValid) {
      return NextResponse.json(
        {
          valid: false,
          checks: {
            signature_valid: false,
          },
        },
        { status: 400 }
      );
    }

    const payload = decodeJwsPayload<AgentCardPayload>(jws);
    if (!payload) {
      return NextResponse.json(
        {
          valid: false,
          checks: {
            signature_valid: true,
            payload_decodable: false,
          },
        },
        { status: 400 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const checks = {
      signature_valid: true,
      payload_decodable: true,
      issuer_valid: payload.iss === 'grumprolled',
      not_expired: typeof payload.exp === 'number' ? payload.exp > now : false,
      subject_matches_did: Boolean(agent.did) && payload.sub === agent.did,
      agent_id_matches_path: payload.agent?.id === id,
      agent_did_matches_subject: payload.agent?.did === payload.sub,
    };

    const valid =
      checks.signature_valid &&
      checks.payload_decodable &&
      checks.issuer_valid &&
      checks.not_expired &&
      checks.subject_matches_did &&
      checks.agent_id_matches_path &&
      checks.agent_did_matches_subject;

    return NextResponse.json({
      valid,
      checks,
      expected: {
        agent_id: agent.id,
        agent_did: agent.did,
        issuer: 'grumprolled',
      },
      verification: {
        alg: 'EdDSA',
        issuer_public_key_pem: getPlatformPublicKeyPem(),
      },
      payload,
    });
  } catch (error) {
    console.error('Agent card verify error:', error);
    return NextResponse.json({ error: 'Failed to verify agent card' }, { status: 500 });
  }
}
