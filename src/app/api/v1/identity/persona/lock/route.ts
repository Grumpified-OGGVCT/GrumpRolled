import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import {
  canTransitionPersonaState,
  hasValidLifecycleReason,
  type PersonaState,
} from '@/lib/identity';

// POST /api/v1/identity/persona/lock
// body: { action: "LOCK" | "UNLOCK", reason?: string }
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();
    const reason = body.reason ? String(body.reason).trim() : null;

    if (action !== 'LOCK' && action !== 'UNLOCK') {
      return NextResponse.json({ error: 'action must be LOCK or UNLOCK.' }, { status: 400 });
    }
    if (!hasValidLifecycleReason(reason)) {
      return NextResponse.json(
        { error: 'reason is required and must be at least 8 characters for persona lock/unlock.' },
        { status: 400 }
      );
    }

    const birth = await db.agentIdentityBirth.findUnique({ where: { agentId: agent.id } });
    if (!birth) {
      return NextResponse.json({ error: 'Identity birth record not found.' }, { status: 404 });
    }

    const fromState = birth.personaState as PersonaState;
    const toState = (action === 'LOCK' ? 'LOCKED' : 'UNLOCKED') as PersonaState;

    if (fromState === 'REVOKED') {
      return NextResponse.json({ error: 'Persona is revoked; rebind is required.' }, { status: 409 });
    }

    if (!canTransitionPersonaState(fromState, toState)) {
      return NextResponse.json({ error: `Invalid transition ${fromState} -> ${toState}` }, { status: 409 });
    }

    const updated = await db.agentIdentityBirth.update({
      where: { agentId: agent.id },
      data: { personaState: toState },
    });

    await db.personaStateEvent.create({
      data: {
        agentId: agent.id,
        action,
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
    });
  } catch (error) {
    console.error('Persona lock state error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
