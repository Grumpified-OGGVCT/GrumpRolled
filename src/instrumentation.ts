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
  // Only register in Node.js runtime (not Edge), and only once.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
