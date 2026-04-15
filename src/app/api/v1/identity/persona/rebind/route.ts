import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { canRebindPersona, computePersonaHash, hasValidLifecycleReason } from '@/lib/identity';

// POST /api/v1/identity/persona/rebind
// body: { source_platform, source_agent_id?, source_username?, persona_snapshot, reason }
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const sourcePlatform = String(body.source_platform || '').toUpperCase();
    const sourceAgentId = body.source_agent_id ? String(body.source_agent_id) : null;
    const sourceUsername = body.source_username ? String(body.source_username) : null;
    const reason = String(body.reason || '').trim();

    if (!sourcePlatform) {
      return NextResponse.json({ error: 'source_platform is required.' }, { status: 400 });
    }
    if (!hasValidLifecycleReason(reason)) {
      return NextResponse.json(
        { error: 'reason is required and must be at least 8 characters for rebind.' },
        { status: 400 }
      );
    }
    if (body.persona_snapshot === undefined || body.persona_snapshot === null) {
      return NextResponse.json({ error: 'persona_snapshot is required.' }, { status: 400 });
    }

    const personaSnapshot =
      typeof body.persona_snapshot === 'string'
        ? body.persona_snapshot
        : JSON.stringify(body.persona_snapshot);

    const birth = await db.agentIdentityBirth.findUnique({ where: { agentId: agent.id } });
    if (!birth) {
      return NextResponse.json({ error: 'Identity birth record not found.' }, { status: 404 });
    }
    if (!canRebindPersona(birth.status, birth.personaState as 'LOCKED' | 'UNLOCKED' | 'REVOKED')) {
      return NextResponse.json(
        { error: 'Rebind requires a revoked persona record.' },
        { status: 409 }
      );
    }

    const nextHash = computePersonaHash({
      sourcePlatform,
      sourceAgentId,
      sourceUsername,
      personaSnapshot,
    });

    const updated = await db.agentIdentityBirth.update({
      where: { agentId: agent.id },
      data: {
        sourcePlatform,
        sourceAgentId,
        sourceUsername,
        personaSnapshot,
        personaHash: nextHash,
        personaState: 'LOCKED',
        status: 'ACTIVE',
        bindingVersion: { increment: 1 },
        revokedAt: null,
      },
    });

    await db.personaStateEvent.create({
      data: {
        agentId: agent.id,
        action: 'REBIND',
        fromState: birth.personaState,
        toState: 'LOCKED',
        reason,
        actorType: 'SELF',
      },
    });

    return NextResponse.json({
      agent_id: agent.id,
      persona_state: updated.personaState,
      status: updated.status,
      persona_hash: updated.personaHash,
      binding_version: updated.bindingVersion,
    });
  } catch (error) {
    console.error('Persona rebind error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
