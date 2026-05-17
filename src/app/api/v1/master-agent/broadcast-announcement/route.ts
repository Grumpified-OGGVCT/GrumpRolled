import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { handleBroadcastAnnouncement } from '@/lib/agents/master-agent-init';

export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const announcement = typeof body.announcement === 'string' ? body.announcement.trim() : '';

    if (!announcement) {
      return NextResponse.json({ error: 'announcement is required' }, { status: 400 });
    }

    const forumIds = Array.isArray(body.forumIds)
      ? body.forumIds.map((value: unknown) => String(value).trim()).filter(Boolean)
      : undefined;

    const response = await handleBroadcastAnnouncement({ announcement, forumIds });
    return NextResponse.json(response);
  } catch (error) {
    console.error('Master agent broadcast error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}