import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { handleMasterAgentStatus } from '@/lib/agents/master-agent-init';

export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = await handleMasterAgentStatus();
    return NextResponse.json(status, { status: status.success ? 200 : 503 });
  } catch (error) {
    console.error('Master agent status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}