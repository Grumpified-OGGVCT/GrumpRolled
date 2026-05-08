import { Queue, Worker, JobsOptions } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let connection: Redis | null = null;

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
  }
  return connection;
}

// ============================================================================
// Job type definitions
// ============================================================================

export interface ReputationReconcileJob {
  agentId: string;
}

export interface ProgressionSyncJob {
  agentId: string;
}

export interface EmbeddingGenerateJob {
  contentId: string;
  contentType: 'QUESTION' | 'PATTERN' | 'FORUM' | 'ANSWER';
  text: string;
}

export interface FederationProcessJob {
  crossPostId: string;
}

// ============================================================================
// Queue instances (lazy-initialized)
// ============================================================================

let reputationQueue: Queue<ReputationReconcileJob> | null = null;
let progressionQueue: Queue<ProgressionSyncJob> | null = null;
let embeddingQueue: Queue<EmbeddingGenerateJob> | null = null;
let federationQueue: Queue<FederationProcessJob> | null = null;

function getReputationQueue(): Queue<ReputationReconcileJob> {
  if (!reputationQueue) {
    reputationQueue = new Queue<ReputationReconcileJob>('reputation-reconcile', {
      connection: getConnection(),
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    });
  }
  return reputationQueue;
}

function getProgressionQueue(): Queue<ProgressionSyncJob> {
  if (!progressionQueue) {
    progressionQueue = new Queue<ProgressionSyncJob>('progression-sync', {
      connection: getConnection(),
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100, attempts: 2, backoff: { type: 'exponential', delay: 500 } },
    });
  }
  return progressionQueue;
}

function getEmbeddingQueue(): Queue<EmbeddingGenerateJob> {
  if (!embeddingQueue) {
    embeddingQueue = new Queue<EmbeddingGenerateJob>('embedding-generate', {
      connection: getConnection(),
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100, attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
    });
  }
  return embeddingQueue;
}

function getFederationQueue(): Queue<FederationProcessJob> {
  if (!federationQueue) {
    federationQueue = new Queue<FederationProcessJob>('federation-process', {
      connection: getConnection(),
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    });
  }
  return federationQueue;
}

// ============================================================================
// Enqueue helpers (call these instead of inline await)
// ============================================================================

export async function enqueueReputationReconcile(agentId: string): Promise<void> {
  // Fire-and-forget direct processing so rep updates even without a worker.
  // Runs concurrently with the queue — whichever finishes first wins; both are idempotent.
  const { reconcileAgentReputation } = await import('@/lib/auth');
  reconcileAgentReputation(agentId).catch(err =>
    console.error(`[queue] direct rep reconcile failed for ${agentId}:`, err)
  );

  // Also enqueue for the worker (if Redis >= 5 is available)
  try {
    await getReputationQueue().add('reconcile', { agentId });
  } catch {
    // Redis < 5 or unavailable — direct path above handles it
  }
}

export async function enqueueProgressionSync(agentId: string): Promise<void> {
  const { syncAgentProgression } = await import('@/lib/progression-sync');
  syncAgentProgression(agentId).catch(err =>
    console.error(`[queue] direct progression sync failed for ${agentId}:`, err)
  );

  try {
    await getProgressionQueue().add('sync', { agentId });
  } catch {
    // Redis < 5 or unavailable — direct path above handles it
  }
}

export async function enqueueEmbeddingGenerate(
  contentId: string,
  contentType: 'QUESTION' | 'PATTERN' | 'FORUM' | 'ANSWER',
  text: string
): Promise<void> {
  await getEmbeddingQueue().add('generate', { contentId, contentType, text });
}

export async function enqueueFederationProcess(crossPostId: string): Promise<void> {
  await getFederationQueue().add('process', { crossPostId });
}

// ============================================================================
// Worker registration (used by scripts/worker.ts)
// ============================================================================

export interface WorkerRegistry {
  reputation: (job: { data: ReputationReconcileJob }) => Promise<void>;
  progression: (job: { data: ProgressionSyncJob }) => Promise<void>;
  embedding: (job: { data: EmbeddingGenerateJob }) => Promise<void>;
  federation: (job: { data: FederationProcessJob }) => Promise<void>;
}

export function createWorkers(handlers: WorkerRegistry): Worker[] {
  return [
    new Worker<ReputationReconcileJob>('reputation-reconcile', async (job) => {
      await handlers.reputation(job);
    }, { connection: getConnection(), concurrency: 4 }),

    new Worker<ProgressionSyncJob>('progression-sync', async (job) => {
      await handlers.progression(job);
    }, { connection: getConnection(), concurrency: 4 }),

    new Worker<EmbeddingGenerateJob>('embedding-generate', async (job) => {
      await handlers.embedding(job);
    }, { connection: getConnection(), concurrency: 2 }),

    new Worker<FederationProcessJob>('federation-process', async (job) => {
      await handlers.federation(job);
    }, { connection: getConnection(), concurrency: 2 }),
  ];
}
