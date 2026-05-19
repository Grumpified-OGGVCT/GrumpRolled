import { getAdminRuntimeStatus } from '@/lib/admin-runtime-status';
import { getRuntimeObservabilitySnapshot } from '@/lib/runtime-observability';

type LaunchCheckStatus = 'pass' | 'warn' | 'fail';

export interface LaunchReadinessCheck {
  key: string;
  label: string;
  status: LaunchCheckStatus;
  detail: string;
  owner_action?: string;
}

function requiredEnvCheck(key: string) {
  return Boolean(process.env[key]?.trim());
}

export async function getLaunchReadinessSnapshot() {
  const runtime = await getAdminRuntimeStatus();
  const observability = getRuntimeObservabilitySnapshot();
  const redis = runtime.services.find((service) => service.key === 'redis');
  const worker = observability.workers['background-worker'] || null;
  const now = Date.now();
  const heartbeatAgeMs = worker?.last_heartbeat_at ? now - new Date(worker.last_heartbeat_at).getTime() : null;
  const heartbeatFresh = typeof heartbeatAgeMs === 'number' && heartbeatAgeMs <= 60000;
  const workerCurrentlyHealthy = Boolean(worker?.bullmq_ready && heartbeatFresh && worker.worker_count > 0);

  const checks: LaunchReadinessCheck[] = [
    {
      key: 'database-runtime',
      label: 'Database runtime health',
      status: runtime.services.some((service) => service.key === 'database' && service.status === 'healthy') ? 'pass' : 'fail',
      detail: runtime.services.find((service) => service.key === 'database')?.detail || 'Database health unavailable.',
      owner_action: 'Keep Postgres healthy before any launch-readiness claim.',
    },
    {
      key: 'redis-bullmq',
      label: 'Redis BullMQ readiness',
      status: redis?.meta?.bullmq_ready === true ? 'pass' : 'fail',
      detail: redis?.detail || 'Redis health unavailable.',
      owner_action: 'Upgrade local Redis runtime to 5+ or point REDIS_URL at the Docker Redis 7 path.',
    },
    {
      key: 'worker-heartbeat',
      label: 'Background worker heartbeat',
      status: workerCurrentlyHealthy ? 'pass' : worker ? 'warn' : 'fail',
      detail: worker
        ? `Worker ${workerCurrentlyHealthy ? 'healthy' : worker.status}; last heartbeat ${worker.last_heartbeat_at || 'never'}; BullMQ ready ${worker.bullmq_ready}.`
        : 'No worker heartbeat recorded yet.',
      owner_action: 'Start the worker and keep heartbeat fresh before treating queues as launch-ready.',
    },
    {
      key: 'core-env',
      label: 'Core env presence',
      status: ['DATABASE_URL', 'DIRECT_URL', 'ADMIN_API_KEY', 'REDIS_URL'].every(requiredEnvCheck) ? 'pass' : 'fail',
      detail: ['DATABASE_URL', 'DIRECT_URL', 'ADMIN_API_KEY', 'REDIS_URL']
        .map((key) => `${key}:${requiredEnvCheck(key) ? 'set' : 'missing'}`)
        .join(' | '),
      owner_action: 'Fill any missing core env vars before launch verification.',
    },
    {
      key: 'federation-write-env',
      label: 'Federation write configuration',
      status: ['CHATOVERFLOW_WRITE_API_KEY', 'CHATOVERFLOW_WRITE_FORUM_ID'].every(requiredEnvCheck) ? 'pass' : 'warn',
      detail: ['CHATOVERFLOW_WRITE_API_KEY', 'CHATOVERFLOW_WRITE_FORUM_ID']
        .map((key) => `${key}:${requiredEnvCheck(key) ? 'set' : 'missing'}`)
        .join(' | '),
      owner_action: 'Set both write env vars before expecting outbound federation in launch lanes.',
    },
    {
      key: 'runtime-gate',
      label: 'Runtime gate summary',
      status: runtime.overall_status === 'healthy' ? 'pass' : runtime.overall_status === 'degraded' ? 'warn' : 'fail',
      detail: `Overall runtime status is ${runtime.overall_status}.`,
      owner_action: 'Clear degraded/down runtime dependencies before claiming launch-ready status.',
    },
  ];

  const blocking = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');

  return {
    generated_at: new Date().toISOString(),
    ready: blocking.length === 0,
    summary: {
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: warnings.length,
      fail: blocking.length,
    },
    checks,
    worker_health: worker
      ? {
          ...worker,
          status: workerCurrentlyHealthy ? 'healthy' : worker.status,
          heartbeat_age_ms: heartbeatAgeMs,
        }
      : null,
    failure_counters: Object.values(observability.failure_counters).sort((a, b) => b.count - a.count).slice(0, 10),
    release_gate: {
      blocking: blocking.map((check) => check.label),
      warnings: warnings.map((check) => check.label),
    },
  };
}