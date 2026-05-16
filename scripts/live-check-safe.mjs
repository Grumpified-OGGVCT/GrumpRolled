#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const port = Number(process.env.GRUMPROLLED_PORT || process.env.PORT || 4692);
const baseUrl = process.env.GRUMPROLLED_LIVE_CHECK_BASE_URL || `http://127.0.0.1:${port}`;
const startupTimeoutMs = Number(process.env.GRUMPROLLED_LIVE_CHECK_STARTUP_TIMEOUT_MS || 90_000);
const maxRuntimeMs = Number(process.env.GRUMPROLLED_LIVE_CHECK_MAX_RUNTIME_MS || 180_000);
const keepAlive = hasFlag('--keep-alive') || isTruthy(process.env.GRUMPROLLED_LIVE_CHECK_KEEP_ALIVE);
const routes = getRoutes();

let child;
let shutdownStarted = false;
let outputTail = [];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function getRoutes() {
  const arg = process.argv.find((item) => item.startsWith('--routes='));
  const configured = arg?.slice('--routes='.length) || process.env.GRUMPROLLED_LIVE_CHECK_ROUTES;
  if (configured) return configured.split(',').map((item) => item.trim()).filter(Boolean);
  return ['/', '/skills', '/api/v1/health', '/.well-known/mcp.json'];
}

function rememberOutput(chunk) {
  const text = String(chunk || '');
  process.stdout.write(text);
  outputTail.push(...text.split(/\r?\n/).filter(Boolean));
  if (outputTail.length > 80) outputTail = outputTail.slice(-80);
}

async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer() {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = 'server not ready';

  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`dev server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/v1/health`, 5_000);
      if (response.status < 500) return;
      lastError = `health returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(1_000);
  }

  throw new Error(`dev server did not become ready within ${startupTimeoutMs}ms: ${lastError}`);
}

async function probeRoutes() {
  const failures = [];
  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    const response = await fetchWithTimeout(url, 15_000);
    const text = await response.text();
    const ok = response.status >= 200 && response.status < 500;
    console.log(`[live-check] ${route} -> HTTP ${response.status} (${text.length} bytes)`);
    if (!ok) failures.push(`${route} returned HTTP ${response.status}`);
  }

  if (failures.length) {
    throw new Error(`route probe failures: ${failures.join('; ')}`);
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // best effort
    }
  }
}

async function cleanup() {
  if (shutdownStarted || keepAlive) return;
  shutdownStarted = true;
  if (child?.pid) {
    console.log(`[live-check] stopping dev server process tree rooted at PID ${child.pid}`);
    killProcessTree(child.pid);
    await delay(1_500);
  }
}

async function main() {
  console.log('[live-check] starting safe hot-reload server check');
  console.log(`[live-check] base URL: ${baseUrl}`);
  console.log(`[live-check] routes: ${routes.join(', ')}`);
  console.log('[live-check] safety: Webpack unless GRUMPROLLED_DEV_TURBO=true; scheduler off; telemetry off; cloud-only model policy preserved');

  child = spawn(process.execPath, ['scripts/dev-safe.mjs'], {
    cwd: repoRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      GRUMPROLLED_PORT: String(port),
      PORT: String(port),
      GRUMPROLLED_DEV_TURBO: process.env.GRUMPROLLED_DEV_TURBO || 'false',
      RESIDENT_SCHEDULER_AUTOSTART: process.env.RESIDENT_SCHEDULER_AUTOSTART || 'false',
      RESIDENT_SCHEDULER_ALLOW_DEV: process.env.RESIDENT_SCHEDULER_ALLOW_DEV || 'false',
      GRUMPROLLED_NEXT_CPUS: process.env.GRUMPROLLED_NEXT_CPUS || '2',
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
      GRUMPROLLED_CLOUD_MODELS_ONLY: process.env.GRUMPROLLED_CLOUD_MODELS_ONLY || 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  child.stdout.on('data', rememberOutput);
  child.stderr.on('data', rememberOutput);

  const runtimeTimer = setTimeout(() => {
    console.error(`[live-check] max runtime ${maxRuntimeMs}ms exceeded; stopping server`);
    cleanup().finally(() => process.exit(124));
  }, maxRuntimeMs);

  try {
    await waitForServer();
    console.log('[live-check] server is ready; probing routes');
    await probeRoutes();
    console.log('[live-check] live route check passed');
    if (keepAlive) {
      console.log('[live-check] --keep-alive set; leaving dev server running for browser use');
      console.log(`[live-check] open ${baseUrl}`);
      return;
    }
  } catch (error) {
    console.error('[live-check] failed:', error instanceof Error ? error.message : error);
    console.error('[live-check] recent server output:');
    for (const line of outputTail.slice(-30)) console.error(line);
    process.exitCode = 1;
  } finally {
    clearTimeout(runtimeTimer);
    await cleanup();
  }
}

process.on('SIGINT', () => {
  cleanup().finally(() => process.exit(130));
});
process.on('SIGTERM', () => {
  cleanup().finally(() => process.exit(143));
});
process.on('exit', () => {
  if (!keepAlive && child?.pid) killProcessTree(child.pid);
});

main();
