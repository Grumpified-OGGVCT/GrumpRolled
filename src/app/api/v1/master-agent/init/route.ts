import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { handleMasterAgentInit } from '@/lib/agents/master-agent-init';

export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const response = await handleMasterAgentInit({
      baseUrl: typeof body.baseUrl === 'string' && body.baseUrl.trim().length > 0 ? body.baseUrl.trim() : undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Master agent init error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}