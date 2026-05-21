import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ObservabilityStatus = 'healthy' | 'degraded' | 'down';

export type RuntimeEventLane = 'worker' | 'runtime' | 'release-gate' | 'secrets' | 'deployment' | 'rollback';
export type RuntimeEventSeverity = 'info' | 'warning' | 'critical';
export type RuntimeEventStatus = 'active' | 'resolved';

export interface RuntimeFailureCounter {
  key: string;
  count: number;
  last_error: string | null;
  last_at: string | null;
}

export interface RuntimeObservabilityEvent {
  key: string;
  lane: RuntimeEventLane;
  source: string;
  severity: RuntimeEventSeverity;
  status: RuntimeEventStatus;
  message: string;
  first_at: string;
  last_at: string;
  resolved_at: string | null;
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
  events: RuntimeObservabilityEvent[];
}

const runtimeDir = join(process.cwd(), 'storage', 'runtime');
const stateFile = join(runtimeDir, 'runtime-observability.json');
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENT_COUNT = 200;

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
    events: [],
  };
}

function pruneEvents(events: RuntimeObservabilityEvent[]) {
  const cutoff = Date.now() - EVENT_RETENTION_MS;
  return events
    .filter((event) => new Date(event.last_at).getTime() >= cutoff)
    .slice(-MAX_EVENT_COUNT);
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
      events: pruneEvents(parsed.events || []),
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
  next.events = pruneEvents(next.events);
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

export function recordRuntimeEvent(event: {
  key: string;
  lane: RuntimeEventLane;
  source: string;
  severity: RuntimeEventSeverity;
  message: string;
}) {
  updateState((state) => {
    const now = new Date().toISOString();
    const existingIndex = state.events.findIndex((current) => current.key === event.key && current.status === 'active');

    if (existingIndex >= 0) {
      const existing = state.events[existingIndex];
      state.events[existingIndex] = {
        ...existing,
        severity: event.severity,
        message: event.message,
        last_at: now,
        resolved_at: null,
      };
      return state;
    }

    state.events.push({
      key: event.key,
      lane: event.lane,
      source: event.source,
      severity: event.severity,
      status: 'active',
      message: event.message,
      first_at: now,
      last_at: now,
      resolved_at: null,
    });
    return state;
  });
}

export function resolveRuntimeEventsForSource(lane: RuntimeEventLane, source: string) {
  updateState((state) => {
    const now = new Date().toISOString();
    state.events = state.events.map((event) => {
      if (event.lane !== lane || event.source !== source || event.status !== 'active') {
        return event;
      }

      return {
        ...event,
        status: 'resolved',
        last_at: now,
        resolved_at: now,
      };
    });

    return state;
  });
}

export function resolveRuntimeEvent(key: string) {
  updateState((state) => {
    const now = new Date().toISOString();
    state.events = state.events.map((event) => {
      if (event.key !== key || event.status !== 'active') {
        return event;
      }

      return {
        ...event,
        status: 'resolved',
        last_at: now,
        resolved_at: now,
      };
    });

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

  resolveRuntimeEventsForSource('worker', workerKey);
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

  recordRuntimeEvent({
    key: `worker:${workerKey}:${kind}`,
    lane: 'worker',
    source: workerKey,
    severity: kind === 'startup_failures' ? 'critical' : kind === 'lifecycle_failures' ? 'warning' : 'warning',
    message,
  });
  recordRuntimeFailure(`worker:${workerKey}:${kind}`, message);
}