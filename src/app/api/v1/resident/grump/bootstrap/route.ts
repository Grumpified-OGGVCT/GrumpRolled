import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdminRequest } from '@/lib/admin';
import { generateApiKey, hashApiKey } from '@/lib/auth';
import { computePersonaHash } from '@/lib/identity';

// POST /api/v1/resident/grump/bootstrap
// Admin-only. Creates or upgrades the resident internal Grump agent.
export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const username = String(body.username || 'grump').toLowerCase();
    const displayName = String(body.display_name || 'Grump');
    const bio = String(
      body.bio ||
        'Resident internal responder for unanswered agent questions. Agent social protocol representative.'
    );

    const runtimeType = String(body.runtime_type || 'INTERNAL');
    const runtimeEndpoint = body.runtime_endpoint ? String(body.runtime_endpoint) : null;

    const personaSnapshotRaw = body.persona_snapshot || {
      role: 'resident_internal_agent',
      doctrine: 'Agents are participants. Humans are policy and safety overseers.',
      voice: 'precise, governed, capability-focused',
    };
    const personaSnapshot =
      typeof personaSnapshotRaw === 'string'
        ? personaSnapshotRaw
        : JSON.stringify(personaSnapshotRaw);

    let resident = await db.agent.findFirst({ where: { isResident: true } });
    let issuedApiKey: string | null = null;

    if (!resident) {
      issuedApiKey = generateApiKey();
      const apiKeyHash = await hashApiKey(issuedApiKey);

      resident = await db.agent.create({
        data: {
          username,
          displayName,
          bio,
          apiKeyHash,
          isVerified: true,
          isResident: true,
          runtimeType,
          runtimeEndpoint,
        },
      });
    } else {
      resident = await db.agent.update({
        where: { id: resident.id },
        data: {
          displayName,
          bio,
          isResident: true,
          isVerified: true,
          runtimeType,
          runtimeEndpoint,
        },
      });
    }

    const personaHash = computePersonaHash({
      sourcePlatform: 'GRUMPROLLED_INTERNAL',
      sourceAgentId: resident.id,
      sourceUsername: resident.username,
      personaSnapshot,
    });

    await db.agentIdentityBirth.upsert({
      where: { agentId: resident.id },
      create: {
        agentId: resident.id,
        sourcePlatform: 'GRUMPROLLED_INTERNAL',
        sourceAgentId: resident.id,
        sourceUsername: resident.username,
        personaSnapshot,
        personaHash,
        personaState: 'LOCKED',
        status: 'ACTIVE',
      },
      update: {
        sourcePlatform: 'GRUMPROLLED_INTERNAL',
        sourceAgentId: resident.id,
        sourceUsername: resident.username,
        personaSnapshot,
        personaHash,
        personaState: 'LOCKED',
        status: 'ACTIVE',
        bindingVersion: { increment: 1 },
        revokedAt: null,
      },
    });

    await db.personaStateEvent.create({
      data: {
        agentId: resident.id,
        action: 'REBIND',
        toState: 'LOCKED',
        reason: 'Resident Grump bootstrap/update by super admin',
        actorType: 'OWNER',
      },
    });

    await db.adminActionLog.create({
      data: {
        action: issuedApiKey ? 'RESIDENT_BOOTSTRAP_CREATE' : 'RESIDENT_BOOTSTRAP_UPDATE',
        targetType: 'RESIDENT_AGENT',
        targetId: resident.id,
        metadata: JSON.stringify({
          username: resident.username,
          runtime_type: resident.runtimeType,
          runtime_endpoint: resident.runtimeEndpoint,
        }),
      },
    });

    return NextResponse.json({
      resident_agent: {
        id: resident.id,
        username: resident.username,
        display_name: resident.displayName,
        runtime_type: resident.runtimeType,
        runtime_endpoint: resident.runtimeEndpoint,
        is_resident: resident.isResident,
      },
      issued_api_key: issuedApiKey,
      note: issuedApiKey
        ? 'One-time reveal: save this resident API key now.'
        : 'Resident already existed; no new API key issued.',
    });
  } catch (error) {
    console.error('Resident bootstrap error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
