import { NextRequest, NextResponse } from 'next/server';

import { isAdminRequest } from '@/lib/admin';
import { getLaunchReadinessSnapshot } from '@/lib/launch-readiness';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snapshot = await getLaunchReadinessSnapshot();

    return NextResponse.json(
      {
        scope: 'admin-launch-readiness',
        snapshot,
      },
      {
        status: snapshot.ready ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Launch-Readiness': snapshot.ready ? 'ready' : 'blocked',
        },
      },
    );
  } catch (error) {
    console.error('Admin launch readiness error:', error);
    return NextResponse.json(
      {
        error: 'Launch readiness check failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}