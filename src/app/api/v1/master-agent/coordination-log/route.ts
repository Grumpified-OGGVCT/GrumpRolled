import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { handleGetCoordinationLog } from '@/lib/agents/master-agent-init';

export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));
    const response = await handleGetCoordinationLog(limit);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Master agent coordination log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}