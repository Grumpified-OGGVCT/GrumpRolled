#!/usr/bin/env node

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import net from 'net';
import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';
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
const repoRoot = join(__dirname, '..');
const lockFile = join(repoRoot, LOCK_PATHS.dev);
const runtimeHeavyLockFile = join(repoRoot, LOCK_PATHS.runtimeHeavy);
const port = Number(process.env.GRUMPROLLED_PORT || process.env.PORT || 4692);
const truthy = new Set(['1', 'true', 'yes', 'on']);

function isTruthy(value) {
  return truthy.has(String(value || '').toLowerCase());
}

function releaseDevLock() {
  if (existsSync(lockFile)) {
    releaseLockFile();
  }
}

function releaseLockFile() {
  releaseLock(lockFile);
}

function isPortBusy(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function main() {
  loadPreferredPostgresEnv();

  ensureInactive(
    runtimeHeavyLockFile,
    (existing) => `[safe-dev] Refusing to start: runtime-heavy task '${existing.task || 'unknown'}' is active under PID ${existing.pid}.`
  );

  const existing = readLock(lockFile);
  if (existing?.pid && processAlive(existing.pid)) {
    console.error(`[safe-dev] Refusing to start: dev server lock already held by PID ${existing.pid}.`);
    process.exit(1);
  }

  releaseLockFile();

  if (await isPortBusy(port)) {
    console.error(`[safe-dev] Refusing to start: port ${port} is already in use.`);
    process.exit(1);
  }

  acquireLock(lockFile, {
    pid: process.pid,
    port,
    started_at: new Date().toISOString(),
  });
  attachLockCleanup(lockFile);

  const nextBin = join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const useTurbo = isTruthy(process.env.GRUMPROLLED_DEV_TURBO);
  const devArgs = [nextBin, 'dev', '-p', String(port), useTurbo ? '--turbo' : '--webpack'];

  console.log(
    `[safe-dev] Starting hot-reload Next dev on port ${port} with ${useTurbo ? 'Turbopack' : 'Webpack'}; resident scheduler autostart is ${isTruthy(process.env.RESIDENT_SCHEDULER_AUTOSTART) ? 'requested' : 'off'}; worker cap ${process.env.GRUMPROLLED_NEXT_CPUS || process.env.NEXT_BUILD_CPUS || '2'}.`
  );

  const child = spawn(process.execPath, devArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED || '1',
      RESIDENT_SCHEDULER_AUTOSTART: process.env.RESIDENT_SCHEDULER_AUTOSTART || 'false',
    },
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code) => {
    releaseLockFile();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  releaseDevLock();
  console.error('[safe-dev]', error.message);
  process.exit(1);
});