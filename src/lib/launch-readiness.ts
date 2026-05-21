import { getAdminRuntimeStatus } from '@/lib/admin-runtime-status';
import { getRuntimeObservabilitySnapshot, recordRuntimeEvent, resolveRuntimeEvent } from '@/lib/runtime-observability';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type LaunchCheckStatus = 'pass' | 'warn' | 'fail';

export interface LaunchReadinessCheck {
  key: string;
  label: string;
  status: LaunchCheckStatus;
  detail: string;
  owner_action?: string;
}

export interface ReleaseGateCheck {
  key: string;
  label: string;
  status: LaunchCheckStatus;
  detail: string;
  owner_action?: string;
}

function syncReleaseGateEvent(check: ReleaseGateCheck) {
  const eventKey = `release-gate:${check.key}`;
  const lane = check.key === 'deployment-assets'
    ? 'deployment'
    : check.key === 'rollback-discipline'
      ? 'rollback'
      : check.key === 'secrets-guardrails'
        ? 'secrets'
        : 'release-gate';

  if (check.status === 'warn' || check.status === 'fail') {
    recordRuntimeEvent({
      key: eventKey,
      lane,
      source: check.key,
      severity: check.status === 'fail' ? 'critical' : 'warning',
      message: check.detail,
    });
    return;
  }

  resolveRuntimeEvent(eventKey);
}

function requiredEnvCheck(key: string) {
  return Boolean(process.env[key]?.trim());
}

function repoPath(...parts: string[]) {
  return join(process.cwd(), ...parts);
}

function fileExists(pathParts: string[]) {
  return existsSync(repoPath(...pathParts));
}

function fileIncludes(pathParts: string[], needle: string) {
  const path = repoPath(...pathParts);
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf8').includes(needle);
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
  const recentWindowMs = 24 * 60 * 60 * 1000;
  const nowIso = new Date().toISOString();

  const releaseGateChecks: ReleaseGateCheck[] = [
    {
      key: 'deployment-assets',
      label: 'Deployment assets present',
      status: (fileExists(['Dockerfile']) || fileExists(['docker'])) && fileExists(['Caddyfile']) && fileExists(['.github', 'workflows', 'ci.yml']) ? 'pass' : 'fail',
      detail: [
        `docker packaging:${fileExists(['Dockerfile']) ? 'Dockerfile' : fileExists(['docker']) ? 'docker directory' : 'missing'}`,
        `Caddyfile:${fileExists(['Caddyfile']) ? 'present' : 'missing'}`,
        `ci workflow:${fileExists(['.github', 'workflows', 'ci.yml']) ? 'present' : 'missing'}`,
      ].join(' | '),
      owner_action: 'Keep deployment entrypoints and CI workflow present before calling the platform launchable.',
    },
    {
      key: 'rollback-discipline',
      label: 'Rollback runbooks present',
      status:
        fileIncludes(['docs', 'runbooks', 'postgres-migration-cutover.md'], '## Rollback Plan') &&
        fileIncludes(['docs', 'runbooks', 'agent-card-jws-key-rotation.md'], '## Rollback') &&
        fileIncludes(['docs', 'runbooks', 'domain-cutover-grumprolled-lol.md'], '## Rollback')
          ? 'pass'
          : 'warn',
      detail: [
        `postgres cutover:${fileIncludes(['docs', 'runbooks', 'postgres-migration-cutover.md'], '## Rollback Plan') ? 'rollback documented' : 'missing rollback section'}`,
        `jws rotation:${fileIncludes(['docs', 'runbooks', 'agent-card-jws-key-rotation.md'], '## Rollback') ? 'rollback documented' : 'missing rollback section'}`,
        `domain cutover:${fileIncludes(['docs', 'runbooks', 'domain-cutover-grumprolled-lol.md'], '## Rollback') ? 'rollback documented' : 'missing rollback section'}`,
      ].join(' | '),
      owner_action: 'Keep rollback sections current whenever deployment or key rotation posture changes.',
    },
    {
      key: 'secrets-guardrails',
      label: 'Secrets guardrails',
      status:
        fileExists(['scripts', 'pre-push-safety.mjs']) &&
        fileIncludes(['.gitignore'], '.env.local') &&
        fileIncludes(['.gitignore'], 'scripts/squad-manifest.json')
          ? 'pass'
          : 'fail',
      detail: [
        `pre-push safety:${fileExists(['scripts', 'pre-push-safety.mjs']) ? 'present' : 'missing'}`,
        `.env guard:${fileIncludes(['.gitignore'], '.env.local') ? 'present' : 'missing'}`,
        `squad manifest guard:${fileIncludes(['.gitignore'], 'scripts/squad-manifest.json') ? 'present' : 'missing'}`,
      ].join(' | '),
      owner_action: 'Keep secret-bearing env files and squad manifests blocked from git, and keep the safety harness in the release path.',
    },
  ];

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
    ...releaseGateChecks,
  ];

  const blocking = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');
  releaseGateChecks.forEach(syncReleaseGateEvent);
  const persistedEvents = observability.events;
  const activeEvents = persistedEvents.filter((event) => event.status === 'active');
  const resolvedEvents = persistedEvents.filter((event) => event.status === 'resolved');
  const recentFailureCounters = Object.values(observability.failure_counters)
    .map((counter) => {
      const recentCount = persistedEvents.filter((event) => event.key === counter.key && new Date(event.last_at).getTime() >= now - recentWindowMs).length;
      return {
        key: counter.key,
        count_lifetime: counter.count,
        count_recent_24h: recentCount,
        count_historical: Math.max(0, counter.count - recentCount),
        last_error: counter.last_error,
        last_at: counter.last_at,
      };
    })
    .sort((a, b) => b.count_recent_24h - a.count_recent_24h || b.count_lifetime - a.count_lifetime)
    .slice(0, 10);

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
    failure_counters: recentFailureCounters,
    event_lanes: {
      active: activeEvents.slice(0, 20),
      resolved_recent: resolvedEvents.filter((event) => event.resolved_at && now - new Date(event.resolved_at).getTime() < recentWindowMs).slice(0, 20),
    },
    release_gate: {
      blocking: blocking.map((check) => check.label),
      warnings: warnings.map((check) => check.label),
    },
  };
}