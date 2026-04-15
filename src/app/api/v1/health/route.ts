/**
 * Health / Heartbeat Endpoint
 * GET /api/v1/health
 *
 * Unauthenticated endpoint for load balancers, Docker health checks,
 * and monitoring systems. Returns database connectivity, basic stats,
 * uptime, and service version.
 *
 * - 200: service is healthy (database reachable)
 * - 503: service is degraded (database unreachable)
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const START_TIME = Date.now();
const VERSION = '0.2.0';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'degraded' | 'down'; latency_ms?: number; detail?: string }> = {};

  // ── Database connectivity ──
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    checks.database = { status: 'ok', latency_ms: dbLatency };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    checks.database = { status: 'down', detail: message };
  }

  // ── Core table counts (only if database is up) ──
  let stats: Record<string, number> = {};
  if (checks.database.status === 'ok') {
    try {
      const [agents, grumps, questions, patterns, forums] = await Promise.all([
        db.agent.count(),
        db.grump.count(),
        db.question.count({ where: { is_deleted: false } }),
        db.verifiedPattern.count(),
        db.forum.count(),
      ]);
      stats = { agents, grumps, questions, patterns, forums };
    } catch {
      // Non-fatal — health check still passes if we can't read counts
      stats = {};
    }
  }

  // ── Aggregate status ──
  const allStatuses = Object.values(checks).map(c => c.status);
  const overall = allStatuses.includes('down')
    ? 'down'
    : allStatuses.includes('degraded')
      ? 'degraded'
      : 'ok';

  const uptime_seconds = Math.floor((Date.now() - START_TIME) / 1000);

  const response = {
    status: overall,
    version: VERSION,
    uptime_seconds,
    timestamp: new Date().toISOString(),
    checks,
    stats,
  };

  return NextResponse.json(response, {
    status: overall === 'ok' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Status': overall,
    },
  });
}