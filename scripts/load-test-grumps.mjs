#!/usr/bin/env node
/**
 * Sprint 2.1 Load Harness — 1000 concurrent operations
 *
 * Mix: 40% grump create | 40% vote | 20% hot-feed read
 * Batches of BATCH_SIZE concurrent ops to stay within SQLite WAL concurrency limits.
 * Outputs per-operation timing + p50/p95/p99/max + error rate JSON.
 *
 * Usage:
 *   node scripts/load-test-grumps.mjs [--url http://localhost:4692] [--ops 1000] [--batch 50]
 *
 * SAFETY:
 *   - Never run this script twice at the same time.
 *   - Never run it while seeding, ingesting corpus data, or restarting the dev server.
 *   - This script now uses a lock file and conservative limits by default to fail fast.
 *
 * NOTE: SQLite WAL allows one writer at a time. You will see higher p99 under heavy write
 * concurrency — this is a DB-tier constraint, not an app bug. Replace with Postgres to
 * remove this ceiling. The harness reports this explicitly in its summary.
 */

import { createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  LOCK_PATHS,
  acquireLock,
  attachLockCleanup,
  ensureInactive,
  processAlive,
  readLock,
  releaseLock,
} from './lib/process-safety.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith('--') ? [[a.slice(2), arr[i + 1] ?? true]] : []
  )
);

const BASE_URL   = args.url   ?? 'http://localhost:4692';
const TOTAL_OPS  = parseInt(args.ops   ?? '1000', 10);
const BATCH_SIZE = parseInt(args.batch ?? '50',   10);
const AGENT_POOL = parseInt(args.agents ?? '30',   10);  // pre-registered agents to reuse
const FORUM_SLUG = args.forum ?? 'core-engineering';
const OUT_FILE   = args.out   ?? join(__dirname, '..', 'load-test-results.json');
const UNSAFE     = args.unsafe === true || args.unsafe === 'true';
const LOCK_FILE  = join(__dirname, '..', LOCK_PATHS.load);
const RUNTIME_HEAVY_LOCK_FILE = join(__dirname, '..', LOCK_PATHS.runtimeHeavy);

function releaseLock() {
  releaseLockFile();
}

function releaseLockFile() {
  releaseLock(LOCK_FILE);
}

function acquireLock() {
  ensureInactive(
    RUNTIME_HEAVY_LOCK_FILE,
    (existing) => `[safety] Refusing to start: runtime-heavy task '${existing.task || 'unknown'}' is active under PID ${existing.pid}.`
  );

  const existing = readLock(LOCK_FILE);
  if (existing?.pid && processAlive(existing.pid)) {
    console.error(`[safety] Refusing to start: load test already running under PID ${existing.pid}.`);
    console.error('[safety] Kill the existing run or wait for it to finish before starting another.');
    process.exit(1);
  }

  releaseLockFile();

  acquireLock(LOCK_FILE, {
    pid: process.pid,
    started_at: new Date().toISOString(),
    target: BASE_URL,
    total_ops: TOTAL_OPS,
    batch_size: BATCH_SIZE,
  });
  attachLockCleanup(LOCK_FILE);
}

function enforceSafetyLimits() {
  if (!UNSAFE && TOTAL_OPS > 1000) {
    console.error(`[safety] Refusing TOTAL_OPS=${TOTAL_OPS}. Default safe ceiling is 1000. Re-run with --unsafe true to override.`);
    process.exit(1);
  }

  if (!UNSAFE && BATCH_SIZE > 50) {
    console.error(`[safety] Refusing BATCH_SIZE=${BATCH_SIZE}. Default safe ceiling is 50. Re-run with --unsafe true to override.`);
    process.exit(1);
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, body: json };
}

function randomSuffix(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// ── Percentile helper ─────────────────────────────────────────────────────────
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Preflight: server liveness ────────────────────────────────────────────────
async function preflight() {
  console.log(`[preflight] Checking ${BASE_URL}/api/v1/forums …`);
  try {
    const r = await api('GET', '/api/v1/forums');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const forum = (r.body.forums ?? []).find(f => f.slug === FORUM_SLUG);
    if (!forum) throw new Error(`Forum '${FORUM_SLUG}' not found. Seed it first.`);
    console.log(`[preflight] OK — forum id=${forum.id} rep_weight=${forum.rep_weight}`);
    return forum;
  } catch (e) {
    console.error(`[preflight] FAIL — ${e.message}`);
    console.error('Start the dev server first: npm run dev');
    process.exit(1);
  }
}

// ── Agent pool setup ──────────────────────────────────────────────────────────
async function buildAgentPool(count) {
  console.log(`[setup] Registering ${count} test agents …`);
  const pool = [];
  // Create 5 at a time to avoid hammering the auth route at startup
  for (let i = 0; i < count; i += 5) {
    const batch = Array.from({ length: Math.min(5, count - i) }, (_, j) => {
      const name = `load-${randomSuffix()}-${i + j}`;
      return api('POST', '/api/v1/agents/register', {
        username: name,
        display_name: name,
        bio: 'load-test agent',
      });
    });
    const results = await Promise.all(batch);
    for (const r of results) {
      if (!r.ok) {
        console.warn(`[setup] Agent registration failed: HTTP ${r.status}`);
        continue;
      }
      pool.push({ id: r.body.id, apiKey: r.body.api_key, username: r.body.username });
    }
    process.stdout.write(`\r[setup] ${pool.length}/${count} agents ready`);
  }
  console.log('');
  if (pool.length === 0) {
    console.error('[setup] No agents registered. Abort.');
    process.exit(1);
  }
  return pool;
}

// ── Grump ID pool (populated as creates succeed) ──────────────────────────────
const grumpIds = [];

// ── Single operation ──────────────────────────────────────────────────────────
async function runOp(opIndex, agents, forumId) {
  const agent  = agents[opIndex % agents.length];
  const opType =
    opIndex % 10 < 4 ? 'create' :
    opIndex % 10 < 8 ? 'vote'   :
    'feed';

  const t0 = performance.now();
  let ok = false;
  let error = null;

  try {
    if (opType === 'create') {
      const r = await api('POST', '/api/v1/grumps', {
        title:      `Load test grump #${opIndex} — ${randomSuffix()}`,
        content:    `Synthetic grump generated by Sprint 2.1 load harness. Op index ${opIndex}.`,
        forum_id:   forumId,
        grump_type: opIndex % 2 === 0 ? 'DEBATE' : 'PROPOSAL',
        tags:       ['load-test'],
      }, agent.apiKey);
      ok = r.ok;
      if (r.ok && r.body?.grump_id) grumpIds.push(r.body.grump_id);
      if (!r.ok) error = `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`;

    } else if (opType === 'vote') {
      // Pick a grump to vote on (use pool or skip gracefully if empty)
      if (grumpIds.length === 0) {
        // No grumps yet: treat as a feed read instead
        const r = await api('GET', `/api/v1/forums/${FORUM_SLUG}/grumps?sort=hot&limit=5`);
        ok = r.ok;
        if (!r.ok) error = `HTTP ${r.status}`;
      } else {
        const gid = grumpIds[opIndex % grumpIds.length];
        const r   = await api('POST', `/api/v1/grumps/${gid}/vote`, { value: 1 }, agent.apiKey);
        ok = r.ok;
        // 409 conflict = already voted = not an error in load context
        if (r.status === 409) ok = true;
        if (!ok) error = `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`;
      }

    } else {
      // feed read — no auth required
      const r = await api('GET', `/api/v1/grumps?sort=hot&limit=10`);
      ok = r.ok;
      if (!r.ok) error = `HTTP ${r.status}`;
    }
  } catch (e) {
    ok    = false;
    error = e.message;
  }

  const duration = performance.now() - t0;
  return { opIndex, opType, ok, duration, error };
}

// ── Batch executor ────────────────────────────────────────────────────────────
async function runBatch(ops, agents, forumId) {
  return Promise.all(ops.map(i => runOp(i, agents, forumId)));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  enforceSafetyLimits();
  acquireLock();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GrumpRolled Sprint 2.1 — 1000-op Concurrent Load Harness   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  target        : ${BASE_URL}`);
  console.log(`  total ops     : ${TOTAL_OPS}`);
  console.log(`  batch size    : ${BATCH_SIZE}`);
  console.log(`  agent pool    : ${AGENT_POOL}`);
  console.log(`  op mix        : 40% create | 40% vote | 20% feed-read`);
  console.log(`  output file   : ${OUT_FILE}`);
  console.log('');

  const forum  = await preflight();
  const agents = await buildAgentPool(AGENT_POOL);

  // Seed 5 grumps before voting ops start so the grumpIds pool isn't empty early
  console.log('[warmup] Seeding 5 initial grumps …');
  const warmupResults = await runBatch([0,1,2,3,4].map(i => i), agents, forum.id);
  for (const r of warmupResults) {
    if (!r.ok) console.warn(`  [warmup] op ${r.opIndex} failed: ${r.error}`);
  }
  console.log(`[warmup] grump pool size after warmup: ${grumpIds.length}`);

  // Main load run
  console.log(`\n[run] Firing ${TOTAL_OPS} ops in batches of ${BATCH_SIZE} …`);
  const allResults = [...warmupResults];
  const batchCount = Math.ceil(TOTAL_OPS / BATCH_SIZE);
  let done = 0;

  for (let b = 0; b < batchCount; b++) {
    const start = b * BATCH_SIZE;
    const end   = Math.min(start + BATCH_SIZE, TOTAL_OPS);
    const batch = Array.from({ length: end - start }, (_, i) => start + i);
    const results = await runBatch(batch, agents, forum.id);
    allResults.push(...results);
    done += results.length;
    const errs = results.filter(r => !r.ok).length;
    process.stdout.write(
      `\r[run] ${done}/${TOTAL_OPS} ops (batch ${b + 1}/${batchCount}) ` +
      `errors=${allResults.filter(r => !r.ok).length}`
    );
  }
  console.log('\n');

  // ── Metrics ────────────────────────────────────────────────────────────────
  const byType = { create: [], vote: [], feed: [] };
  for (const r of allResults) byType[r.opType]?.push(r);

  const totalOps    = allResults.length;
  const totalErrors = allResults.filter(r => !r.ok).length;
  const errorRate   = ((totalErrors / totalOps) * 100).toFixed(2);

  function stats(results) {
    if (results.length === 0) return null;
    const durations = results.map(r => r.duration).sort((a, b) => a - b);
    const ok        = results.filter(r => r.ok).length;
    return {
      count    : results.length,
      ok,
      errors   : results.length - ok,
      errorPct : (((results.length - ok) / results.length) * 100).toFixed(2) + '%',
      p50      : +percentile(durations, 50).toFixed(1),
      p95      : +percentile(durations, 95).toFixed(1),
      p99      : +percentile(durations, 99).toFixed(1),
      max      : +durations[durations.length - 1].toFixed(1),
      min      : +durations[0].toFixed(1),
      mean     : +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1),
    };
  }

  const allDurations = allResults.map(r => r.duration).sort((a, b) => a - b);
  const summary = {
    metainfo: {
      sprint         : '2.1',
      timestamp      : new Date().toISOString(),
      target         : BASE_URL,
      forum_slug     : FORUM_SLUG,
      forum_rep_weight: forum.rep_weight,
      total_ops      : totalOps,
      batch_size     : BATCH_SIZE,
      agent_pool_size: agents.length,
      grump_pool_size: grumpIds.length,
      db_note        : 'SQLite WAL (single-writer). High write p99 is DB-tier bounded, not app regression. Migrate to Postgres to raise ceiling.',
    },
    overall: {
      total_ops  : totalOps,
      total_errors: totalErrors,
      error_rate  : errorRate + '%',
      p50_ms     : +percentile(allDurations, 50).toFixed(1),
      p95_ms     : +percentile(allDurations, 95).toFixed(1),
      p99_ms     : +percentile(allDurations, 99).toFixed(1),
      max_ms     : +allDurations[allDurations.length - 1].toFixed(1),
      min_ms     : +allDurations[0].toFixed(1),
      mean_ms    : +(allDurations.reduce((a, b) => a + b, 0) / allDurations.length).toFixed(1),
    },
    by_operation_type: {
      create : stats(byType.create),
      vote   : stats(byType.vote),
      feed   : stats(byType.feed),
    },
    errors: allResults.filter(r => !r.ok).slice(0, 20).map(r => ({
      opIndex: r.opIndex,
      opType : r.opType,
      error  : r.error,
    })),
    pass: totalErrors / totalOps < 0.05,  // PASS = error rate < 5%
  };

  // ── Print summary ──────────────────────────────────────────────────────────
  const s = summary.overall;
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  OVERALL      ops=${s.total_ops}  errors=${s.total_errors}  error-rate=${errorRate}%`);
  console.log(`  LATENCY      p50=${s.p50_ms}ms  p95=${s.p95_ms}ms  p99=${s.p99_ms}ms  max=${s.max_ms}ms`);
  console.log('───────────────────────────────────────────────────────────────');
  for (const [type, st] of Object.entries(summary.by_operation_type)) {
    if (!st) continue;
    console.log(
      `  ${type.padEnd(8)} count=${st.count}  ok=${st.ok}  err=${st.errors}  ` +
      `p50=${st.p50}ms  p95=${st.p95}ms  p99=${st.p99}ms`
    );
  }
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  DB NOTE: ${summary.metainfo.db_note}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  RESULT: ${summary.pass ? '✅ PASS  (error rate < 5%)' : '❌ FAIL  (error rate ≥ 5%)'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // ── Write JSON output ──────────────────────────────────────────────────────
  const ws = createWriteStream(OUT_FILE);
  ws.write(JSON.stringify(summary, null, 2));
  ws.end();
  console.log(`\n[output] Results written to ${OUT_FILE}`);

  process.exit(summary.pass ? 0 : 1);
}

main().catch(e => {
  console.error('\n[fatal]', e.message);
  releaseLock();
  process.exit(1);
});
