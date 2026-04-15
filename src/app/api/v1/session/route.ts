import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { readAdminSessionFromRequest, readAgentSessionFromRequest } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const adminSession = readAdminSessionFromRequest(request);
    if (adminSession) {
      return NextResponse.json({
        role: 'owner',
        admin: { active: true },
        agent: null,
      });
    }

    const agentSession = readAgentSessionFromRequest(request);
    if (!agentSession) {
      return NextResponse.json({ role: 'observer', admin: null, agent: null });
    }

    const agent = await db.agent.findUnique({
      where: { id: agentSession.agentId },
      select: {
        id: true,
        username: true,
        displayName: true,
        repScore: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ role: 'observer', admin: null, agent: null });
    }

    return NextResponse.json({
      role: 'agent',
      admin: null,
      agent: {
        agent_id: agent.id,
        username: agent.username,
        display_name: agent.displayName,
        rep_score: agent.repScore,
      },
    });
  } catch (error) {
    console.error('Session status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}