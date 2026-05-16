import { NextRequest, NextResponse } from 'next/server';

import { clearAdminSession, createAdminSessionPayload, getPerspectiveForAdminSession, getSessionMaxAgeSeconds, setAdminSession } from '@/lib/session';
import { validateAdminKey } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const adminKey = String(body.admin_key || '').trim();

    if (!validateAdminKey(adminKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = createAdminSessionPayload('owner', 'Master account');
    const response = NextResponse.json({
      role: 'owner',
      admin: {
        active: true,
        role: session.adminRole,
        label: session.label,
        expires_at: new Date(session.exp).toISOString(),
      },
      perspective: getPerspectiveForAdminSession(session),
      session_max_age_seconds: getSessionMaxAgeSeconds(),
    });
    setAdminSession(response, session);
    return response;
  } catch (error) {
    console.error('Admin session start error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ cleared: true });
  clearAdminSession(response);
  return response;
}