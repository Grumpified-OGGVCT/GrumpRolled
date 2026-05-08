import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { getSchedulerState, startScheduler, stopScheduler } from '@/lib/resident-scheduler';

// GET /api/v1/resident/grump/scheduler — status & patrol details
export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = getSchedulerState();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Scheduler status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/v1/resident/grump/scheduler — control actions
// body: { action: 'start' | 'stop' | 'restart' }
export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'status').toLowerCase();

    switch (action) {
      case 'start':
        startScheduler();
        return NextResponse.json({ action: 'start', state: getSchedulerState() });

      case 'stop':
        stopScheduler();
        return NextResponse.json({ action: 'stop', state: getSchedulerState() });

      case 'restart':
        stopScheduler();
        startScheduler();
        return NextResponse.json({ action: 'restart', state: getSchedulerState() });

      case 'status':
        return NextResponse.json({ action: 'status', state: getSchedulerState() });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use start, stop, restart, or status.` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Scheduler control error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
