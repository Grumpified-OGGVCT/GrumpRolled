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

// Lazy-load handlers to avoid importing the full app on worker init
async function main() {
  const [
    { reconcileAgentReputation },
    { syncAgentProgression },
    { storeContentEmbedding },
    { processFederationDelivery },
  ] = await Promise.all([
    import('../src/lib/auth'),
    import('../src/lib/progression-sync'),
    import('../src/lib/embeddings'),
    import('../src/lib/cross-post').catch(() => ({ processFederationDelivery: undefined })),
  ]);

  const workers = createWorkers({
    reputation: async (job) => {
      const { agentId } = job.data;
      await reconcileAgentReputation(agentId);
    },

    progression: async (job) => {
      const { agentId } = job.data;
      await syncAgentProgression(agentId);
    },

    embedding: async (job) => {
      const { contentId, contentType, text } = job.data;
      await storeContentEmbedding(contentId, contentType, text);
    },

    federation: async (job) => {
      if (!processFederationDelivery) return;
      const { crossPostId } = job.data;
      await processFederationDelivery(crossPostId);
    },
  });

  console.log(`[worker] Started ${workers.length} workers (reputation, progression, embedding, federation)`);

  const shutdown = async () => {
    console.log('[worker] Shutting down...');
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[worker] Failed to start:', error);
  process.exit(1);
});
