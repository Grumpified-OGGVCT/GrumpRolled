import { NextRequest, NextResponse } from 'next/server';

import { clearAdminSession, createAdminSessionPayload, setAdminSession } from '@/lib/session';
import { validateAdminKey } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const adminKey = String(body.admin_key || '').trim();

    if (!validateAdminKey(adminKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = NextResponse.json({ role: 'owner', admin: { active: true } });
    setAdminSession(response, createAdminSessionPayload());
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