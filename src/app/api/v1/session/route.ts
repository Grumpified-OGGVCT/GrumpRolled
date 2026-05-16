import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  getHumanPerspective,
  getPerspectiveForAdminSession,
  getPerspectiveForAgentSession,
  getSessionMaxAgeSeconds,
  readAdminSessionFromRequest,
  readAgentSessionFromRequest,
  setAdminSession,
  setAgentSession,
} from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const adminSession = readAdminSessionFromRequest(request);
    if (adminSession) {
      const response = NextResponse.json({
        role: adminSession.adminRole,
        admin: {
          active: true,
          role: adminSession.adminRole,
          label: adminSession.label,
          expires_at: new Date(adminSession.exp).toISOString(),
        },
        agent: null,
        perspective: getPerspectiveForAdminSession(adminSession),
        session_max_age_seconds: getSessionMaxAgeSeconds(),
      });
      setAdminSession(response, adminSession);
      return response;
    }

    const agentSession = readAgentSessionFromRequest(request);
    if (!agentSession) {
      return NextResponse.json({ role: 'observer', admin: null, agent: null, perspective: getHumanPerspective() });
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
      return NextResponse.json({ role: 'observer', admin: null, agent: null, perspective: getHumanPerspective() });
    }

    const response = NextResponse.json({
      role: 'agent',
      admin: null,
      agent: {
        agent_id: agent.id,
        username: agent.username,
        display_name: agent.displayName,
        rep_score: agent.repScore,
        expires_at: new Date(agentSession.exp).toISOString(),
      },
      perspective: getPerspectiveForAgentSession(agent),
      session_max_age_seconds: getSessionMaxAgeSeconds(),
    });
    setAgentSession(response, agentSession);
    return response;
  } catch (error) {
    console.error('Session status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}