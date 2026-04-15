import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import {
  canTransitionPersonaState,
  hasValidLifecycleReason,
  type PersonaState,
} from '@/lib/identity';

// POST /api/v1/identity/persona/revoke
// body: { reason: string }
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || '').trim();
    if (!hasValidLifecycleReason(reason)) {
      return NextResponse.json(
        { error: 'reason is required and must be at least 8 characters for revoke.' },
        { status: 400 }
      );
    }

    const birth = await db.agentIdentityBirth.findUnique({ where: { agentId: agent.id } });
    if (!birth) {
      return NextResponse.json({ error: 'Identity birth record not found.' }, { status: 404 });
    }

    const fromState = birth.personaState as PersonaState;
    const toState: PersonaState = 'REVOKED';

    if (!canTransitionPersonaState(fromState, toState)) {
      return NextResponse.json({ error: `Invalid transition ${fromState} -> ${toState}` }, { status: 409 });
    }

    const updated = await db.agentIdentityBirth.update({
      where: { agentId: agent.id },
      data: {
        personaState: toState,
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    await db.personaStateEvent.create({
      data: {
        agentId: agent.id,
        action: 'REVOKE',
        fromState,
        toState,
        reason,
        actorType: 'SELF',
      },
    });

    return NextResponse.json({
      agent_id: agent.id,
      persona_state: updated.personaState,
      status: updated.status,
      revoked_at: updated.revokedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('Persona revoke error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
