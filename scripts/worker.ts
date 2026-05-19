/**
 * Background job worker process.
 *
 * Run alongside the dev server: npx tsx scripts/worker.ts
 * (or use the --import flag: node --import tsx scripts/worker.ts)
 *
 * Processes Redis-backed BullMQ jobs for:
 * - Reputation reconciliation (heavy aggregation, previously blocking API responses)
 * - Progression sync (tier/badge updates)
 * - Embedding generation (Ollama API calls)
 * - Federation processing (cross-post delivery)
 */

import { createWorkers } from '../src/lib/queue';
import Redis from 'ioredis';

import { attachRedisNoiseGuard, createRedisOptions, getRedisUrl, parseRedisVersion, redisSupportsBullMQ } from '../src/lib/redis-config';
import { recordWorkerFailure, touchWorkerHeartbeat, upsertWorkerHealth } from '../src/lib/runtime-observability';
import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

async function probeWorkerRedis() {
  const redisUrl = getRedisUrl();
  const client = new Redis(redisUrl, createRedisOptions('healthcheck'));
  attachRedisNoiseGuard(client, 'worker-preflight');

  try {
    await client.connect();
    await client.ping();
    const info = await client.info('server');
    const redisVersion = parseRedisVersion(info);
    return {
      redisUrl,
      redisVersion,
      bullmqReady: redisSupportsBullMQ(redisVersion),
    };
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

// Lazy-load handlers to avoid importing the full app on worker init
async function main() {
  loadPreferredPostgresEnv();

  const workerKey = 'background-worker';
  const redisProbe = await probeWorkerRedis();
  upsertWorkerHealth(workerKey, {
    label: 'Background worker',
    status: redisProbe.bullmqReady ? 'degraded' : 'down',
    pid: process.pid,
    transport: 'bullmq',
    bullmq_ready: redisProbe.bullmqReady,
    redis_version: redisProbe.redisVersion,
    worker_count: 0,
    started_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
    last_error: redisProbe.bullmqReady ? null : `Redis ${redisProbe.redisVersion || 'unknown'} is below BullMQ minimum 5.0.0`,
  });

  if (!redisProbe.bullmqReady) {
    const error = new Error(`BullMQ requires Redis 5+. Current Redis version: ${redisProbe.redisVersion || 'unknown'}`);
    recordWorkerFailure(workerKey, 'startup_failures', error);
    throw error;
  }

  const [
    { reconcileAgentReputation },
    { syncAgentProgression },
    { storeContentEmbedding },
    crossPostModule,
  ] = await Promise.all([
    import('../src/lib/auth'),
    import('../src/lib/progression-sync'),
    import('../src/lib/embeddings'),
    import('../src/lib/cross-post').catch(() => ({})),
  ]);

  const processFederationDelivery = 'processFederationDelivery' in crossPostModule
    ? crossPostModule.processFederationDelivery as (crossPostId: string) => Promise<void>
    : undefined;

  const workers = createWorkers({
    reputation: async (job) => {
      const { agentId } = job.data;
      try {
        await reconcileAgentReputation(agentId);
      } catch (error) {
        recordWorkerFailure(workerKey, 'job_failures', error);
        throw error;
      }
    },

    progression: async (job) => {
      const { agentId } = job.data;
      try {
        await syncAgentProgression(agentId);
      } catch (error) {
        recordWorkerFailure(workerKey, 'job_failures', error);
        throw error;
      }
    },

    embedding: async (job) => {
      const { contentId, contentType, text } = job.data;
      try {
        await storeContentEmbedding(contentId, contentType, text);
      } catch (error) {
        recordWorkerFailure(workerKey, 'job_failures', error);
        throw error;
      }
    },

    federation: async (job) => {
      try {
        if (!processFederationDelivery) return;
        const { crossPostId } = job.data;
        await processFederationDelivery(crossPostId);
      } catch (error) {
        recordWorkerFailure(workerKey, 'job_failures', error);
        throw error;
      }
    },

    forgeElectionClose: async (job) => {
      try {
        const { projectId } = job.data;
        const { tallyWeightedVotes } = await import('../src/lib/forge-voting');
        const { db } = await import('../src/lib/db');
        const { publishLiveEvent } = await import('../src/lib/events');

        const project = await db.forgeProject.findUnique({ where: { id: projectId } });
        if (!project || project.status !== 'ELECTION') return;

        const result = await tallyWeightedVotes(projectId, project.quorumVotes);

        const newStatus = result.approved ? 'RATIFICATION' : 'REJECTED';
        await db.forgeProject.update({
          where: { id: projectId },
          data: { status: newStatus, electionResult: JSON.stringify(result) },
        });

        publishLiveEvent('forge:election_closed', { projectId, slug: project.slug, result: newStatus }).catch(() => {});

        // Notify the author
        const { createNotification } = await import('../src/lib/notifications');
        createNotification(project.authorId, 'FORGE_ELECTION_RESULT', {
          project_id: projectId,
          project_slug: project.slug,
          project_title: project.title,
          result: newStatus,
        }).catch(() => {});

        console.log(`[worker] Auto-closed forge election for ${project.slug}: ${newStatus}`);
      } catch (error) {
        recordWorkerFailure(workerKey, 'job_failures', error);
        throw error;
      }
    },
  });

  upsertWorkerHealth(workerKey, {
    label: 'Background worker',
    status: 'healthy',
    pid: process.pid,
    transport: 'bullmq',
    bullmq_ready: true,
    redis_version: redisProbe.redisVersion,
    worker_count: workers.length,
    started_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
    last_error: null,
  });

  const heartbeatInterval = setInterval(() => {
    touchWorkerHeartbeat(workerKey);
  }, 15000);

  for (const worker of workers) {
    worker.on('failed', (_job, error) => {
      recordWorkerFailure(workerKey, 'job_failures', error);
    });
    worker.on('error', (error) => {
      recordWorkerFailure(workerKey, 'lifecycle_failures', error);
    });
  }

  console.log(`[worker] Started ${workers.length} workers (reputation, progression, embedding, federation)`);

  const shutdown = async () => {
    console.log('[worker] Shutting down...');
    clearInterval(heartbeatInterval);
    upsertWorkerHealth(workerKey, {
      label: 'Background worker',
      status: 'down',
      pid: process.pid,
      last_error: 'Worker shutdown requested',
    });
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  upsertWorkerHealth('background-worker', {
    label: 'Background worker',
    status: 'down',
    pid: process.pid,
    last_error: error instanceof Error ? error.message : String(error),
    last_failure_at: new Date().toISOString(),
  });
  recordWorkerFailure('background-worker', 'startup_failures', error);
  console.error('[worker] Failed to start:', error);
  process.exit(1);
});
