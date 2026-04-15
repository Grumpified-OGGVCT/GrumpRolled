import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';

export const LOCK_PATHS = {
  dev: '.grumprolled-dev.lock',
  load: '.grumprolled-load-test.lock',
  runtimeHeavy: '.grumprolled-runtime-heavy.lock',
};

export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readLock(lockPath) {
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

export function clearStaleLock(lockPath) {
  const existing = readLock(lockPath);
  if (!existing?.pid || !processAlive(existing.pid)) {
    rmSync(lockPath, { force: true });
    return null;
  }
  return existing;
}

export function ensureInactive(lockPath, message) {
  const existing = readLock(lockPath);
  if (!existing?.pid) {
    clearStaleLock(lockPath);
    return;
  }

  if (processAlive(existing.pid)) {
    console.error(message(existing));
    process.exit(1);
  }

  clearStaleLock(lockPath);
}

export function acquireLock(lockPath, payload) {
  clearStaleLock(lockPath);
  writeFileSync(lockPath, JSON.stringify(payload, null, 2));
}

export function releaseLock(lockPath) {
  rmSync(lockPath, { force: true });
}

export function attachLockCleanup(lockPath) {
  const cleanup = () => releaseLock(lockPath);
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
}