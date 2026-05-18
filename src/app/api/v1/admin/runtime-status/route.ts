import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { getAdminRuntimeStatus } from '@/lib/admin-runtime-status';

export const dynamic = 'force-dynamic';

// GET /api/v1/admin/runtime-status
// Admin-only runtime dependency snapshot for Mission Control.
export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snapshot = await getAdminRuntimeStatus();

    return NextResponse.json(
      {
        scope: 'admin-runtime-status',
        snapshot,
      },
      {
        status: snapshot.overall_status === 'healthy' ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Runtime-Status': snapshot.overall_status,
        },
      },
    );
  } catch (error) {
    console.error('Admin runtime status error:', error);
    return NextResponse.json(
      {
        error: 'Runtime status check failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}