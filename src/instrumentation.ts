/**
 * Next.js Instrumentation — Proactive Automation Bootstrap
 *
 * Hooks into the Next.js server lifecycle via the `register()` API.
 * On server startup: starts the resident scheduler (density patrols,
 * squad missions, health checks, stale question answering).
 * On server shutdown: gracefully stops all scheduler intervals.
 *
 * This is the native integration point that makes GrumpRolled
 * proactive rather than purely reactive.
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only register in Node.js runtime (not Edge), and only when explicitly enabled.
  // Next dev/build can fan out into multiple Node worker processes; autostarting
  // scheduler intervals in every worker can swamp a local machine. Keep the
  // proactive resident loop opt-in instead of implicit.
  if (shouldAutostartResidentScheduler()) {
    const { startScheduler } = await import('@/lib/resident-scheduler');
    startScheduler();

    // Graceful shutdown
    const shutdown = async () => {
      const { stopScheduler } = await import('@/lib/resident-scheduler');
      stopScheduler();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
  }
}

export function shouldAutostartResidentScheduler(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_RUNTIME !== 'nodejs') return false;
  if (!isTruthy(env.RESIDENT_SCHEDULER_AUTOSTART)) return false;
  if (env.NODE_ENV !== 'production' && !isTruthy(env.RESIDENT_SCHEDULER_ALLOW_DEV)) return false;
  return true;
}

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}
