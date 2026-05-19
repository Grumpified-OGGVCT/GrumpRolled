import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ObservabilityStatus = 'healthy' | 'degraded' | 'down';

export interface RuntimeFailureCounter {
  key: string;
  count: number;
  last_error: string | null;
  last_at: string | null;
}

export interface WorkerHealthSnapshot {
  key: string;
  label: string;
  status: ObservabilityStatus;
  pid: number | null;
  transport: 'bullmq';
  bullmq_ready: boolean;
  redis_version: string | null;
  worker_count: number;
  started_at: string | null;
  last_heartbeat_at: string | null;
  last_error: string | null;
  last_failure_at: string | null;
  counters: {
    startup_failures: number;
    lifecycle_failures: number;
    job_failures: number;
  };
}

interface RuntimeObservabilityState {
  updated_at: string;
  failure_counters: Record<string, RuntimeFailureCounter>;
  workers: Record<string, WorkerHealthSnapshot>;
}

const runtimeDir = join(process.cwd(), 'storage', 'runtime');
const stateFile = join(runtimeDir, 'runtime-observability.json');

function ensureRuntimeDir() {
  if (!existsSync(runtimeDir)) {
    mkdirSync(runtimeDir, { recursive: true });
  }
}

function defaultState(): RuntimeObservabilityState {
  return {
    updated_at: new Date(0).toISOString(),
    failure_counters: {},
    workers: {},
  };
}

function readState(): RuntimeObservabilityState {
  ensureRuntimeDir();
  if (!existsSync(stateFile)) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as RuntimeObservabilityState;
    return {
      updated_at: parsed.updated_at || new Date(0).toISOString(),
      failure_counters: parsed.failure_counters || {},
      workers: parsed.workers || {},
    };
  } catch {
    return defaultState();
  }
}

function writeState(state: RuntimeObservabilityState) {
  ensureRuntimeDir();
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function updateState(mutator: (state: RuntimeObservabilityState) => RuntimeObservabilityState) {
  const next = mutator(readState());
  next.updated_at = new Date().toISOString();
  writeState(next);
}

export function getRuntimeObservabilitySnapshot() {
  return readState();
}

export function recordRuntimeFailure(key: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');

  updateState((state) => {
    const current = state.failure_counters[key] || {
      key,
      count: 0,
      last_error: null,
      last_at: null,
    };

    state.failure_counters[key] = {
      ...current,
      count: current.count + 1,
      last_error: message,
      last_at: new Date().toISOString(),
    };

    return state;
  });
}

export function upsertWorkerHealth(workerKey: string, snapshot: Partial<WorkerHealthSnapshot> & { label: string }) {
  updateState((state) => {
    const current = state.workers[workerKey] || {
      key: workerKey,
      label: snapshot.label,
      status: 'down' as ObservabilityStatus,
      pid: null,
      transport: 'bullmq' as const,
      bullmq_ready: false,
      redis_version: null,
      worker_count: 0,
      started_at: null,
      last_heartbeat_at: null,
      last_error: null,
      last_failure_at: null,
      counters: {
        startup_failures: 0,
        lifecycle_failures: 0,
        job_failures: 0,
      },
    };

    state.workers[workerKey] = {
      ...current,
      ...snapshot,
      counters: {
        ...current.counters,
        ...(snapshot.counters || {}),
      },
    };

    return state;
  });
}

export function touchWorkerHeartbeat(workerKey: string) {
  updateState((state) => {
    const current = state.workers[workerKey];
    if (!current) return state;

    state.workers[workerKey] = {
      ...current,
      status: current.bullmq_ready ? 'healthy' : current.status,
      last_heartbeat_at: new Date().toISOString(),
    };
    return state;
  });
}

export function recordWorkerFailure(workerKey: string, kind: 'startup_failures' | 'lifecycle_failures' | 'job_failures', error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');

  updateState((state) => {
    const current = state.workers[workerKey];
    if (!current) return state;

    state.workers[workerKey] = {
      ...current,
      status: kind === 'startup_failures' ? 'down' : 'degraded',
      last_error: message,
      last_failure_at: new Date().toISOString(),
      counters: {
        ...current.counters,
        [kind]: current.counters[kind] + 1,
      },
    };

    return state;
  });

  recordRuntimeFailure(`worker:${workerKey}:${kind}`, message);
}