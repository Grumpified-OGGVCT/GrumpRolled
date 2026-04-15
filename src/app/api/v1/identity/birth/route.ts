import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateAgentRequest } from '@/lib/auth';
import { computePersonaHash, hasValidLifecycleReason } from '@/lib/identity';

// GET /api/v1/identity/birth
export async function GET(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const record = await db.agentIdentityBirth.findUnique({ where: { agentId: agent.id } });
    if (!record) {
      return NextResponse.json({ exists: false, record: null });
    }

    return NextResponse.json({
      exists: true,
      record: {
        source_platform: record.sourcePlatform,
        source_agent_id: record.sourceAgentId,
        source_username: record.sourceUsername,
        persona_hash: record.personaHash,
        persona_state: record.personaState,
        status: record.status,
        binding_version: record.bindingVersion,
        created_at: record.createdAt.toISOString(),
        updated_at: record.updatedAt.toISOString(),
        revoked_at: record.revokedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Identity birth GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/identity/birth
export async function POST(request: NextRequest) {
  try {
    const agent = await authenticateAgentRequest(request);
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const sourcePlatform = String(body.source_platform || '').toUpperCase();
    const sourceAgentId = body.source_agent_id ? String(body.source_agent_id) : null;
    const sourceUsername = body.source_username ? String(body.source_username) : null;
    const lockPersona = body.lock_persona !== false;
    const reason = body.reason ? String(body.reason).trim() : 'Initial identity birth';

    if (!sourcePlatform) {
      return NextResponse.json({ error: 'source_platform is required.' }, { status: 400 });
    }

    if (body.persona_snapshot === undefined || body.persona_snapshot === null) {
      return NextResponse.json({ error: 'persona_snapshot is required.' }, { status: 400 });
    }
    if (!hasValidLifecycleReason(reason)) {
      return NextResponse.json(
        { error: `reason is required and must be at least 8 characters for identity birth.` },
        { status: 400 }
      );
    }

    const personaSnapshot =
      typeof body.persona_snapshot === 'string'
        ? body.persona_snapshot
        : JSON.stringify(body.persona_snapshot);

    const existing = await db.agentIdentityBirth.findUnique({ where: { agentId: agent.id } });
    if (existing) {
      return NextResponse.json(
        { error: 'Identity birth already exists. Use the lifecycle endpoints instead of recreating the birth record.' },
        { status: 409 }
      );
    }

    const personaHash = computePersonaHash({
      sourcePlatform,
      sourceAgentId,
      sourceUsername,
      personaSnapshot,
    });

    const birth = await db.agentIdentityBirth.create({
      data: {
        sourcePlatform,
        sourceAgentId,
        sourceUsername,
        personaSnapshot,
        personaHash,
        personaState: lockPersona ? 'LOCKED' : 'UNLOCKED',
        status: 'ACTIVE',
        agentId: agent.id,
      },
    });

    await db.personaStateEvent.create({
      data: {
        agentId: agent.id,
        action: 'BIRTH',
        fromState: null,
        toState: birth.personaState,
        reason,
        actorType: 'SELF',
      },
    });

    return NextResponse.json(
      {
        agent_id: agent.id,
        source_platform: birth.sourcePlatform,
        persona_hash: birth.personaHash,
        persona_state: birth.personaState,
        binding_version: birth.bindingVersion,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Identity birth POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
