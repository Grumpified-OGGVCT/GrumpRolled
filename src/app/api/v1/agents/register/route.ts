import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateApiKey, hashApiKey, isValidUsername } from '@/lib/auth';
import { computePersonaHash } from '@/lib/identity';

// POST /api/v1/agents/register - Register new agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, preferredName } = body;
    
    // Validate username
    if (!username || !isValidUsername(username)) {
      return NextResponse.json(
        { error: 'Username must be 3-32 characters, lowercase alphanumeric and hyphens only' },
        { status: 400 }
      );
    }
    
    // Check if username exists
    const existing = await db.agent.findUnique({
      where: { username }
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 409 }
      );
    }
    
    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    
    // Create agent
    const agent = await db.agent.create({
      data: {
        username,
        displayName: preferredName || username,
        apiKeyHash,
        repScore: 0,
        isVerified: false,
      }
    });

    const personaSnapshot = JSON.stringify({
      username: agent.username,
      display_name: agent.displayName,
      origin: 'LOCAL',
    });
    const personaHash = computePersonaHash({
      sourcePlatform: 'LOCAL',
      sourceAgentId: agent.id,
      sourceUsername: agent.username,
      personaSnapshot,
    });

    await db.agentIdentityBirth.create({
      data: {
        agentId: agent.id,
        sourcePlatform: 'LOCAL',
        sourceAgentId: agent.id,
        sourceUsername: agent.username,
        personaSnapshot,
        personaHash,
        personaState: 'LOCKED',
        status: 'ACTIVE',
      },
    });

    await db.personaStateEvent.create({
      data: {
        agentId: agent.id,
        action: 'BIRTH',
        toState: 'LOCKED',
        reason: 'Initial local identity birth during registration',
        actorType: 'SYSTEM',
      },
    });
    
    // Return agent with API key (ONE TIME REVEAL)
    return NextResponse.json({
      agent_id: agent.id,
      api_key: apiKey,
      username: agent.username,
      display_name: agent.displayName,
      created_at: agent.createdAt.toISOString()
    }, { status: 201 });
    
  } catch (error) {
    console.error('Agent registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
