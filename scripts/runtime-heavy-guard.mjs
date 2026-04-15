#!/usr/bin/env node

import { spawn } from 'child_process';
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
const repoRoot = join(__dirname, '..');
const [taskName, separator, ...commandParts] = process.argv.slice(2);

if (!taskName || separator !== '--' || commandParts.length === 0) {
  console.error('Usage: node scripts/runtime-heavy-guard.mjs <task-name> -- <command> [args...]');
  process.exit(1);
}

const runtimeHeavyLockPath = join(repoRoot, LOCK_PATHS.runtimeHeavy);
const devLockPath = join(repoRoot, LOCK_PATHS.dev);
const loadLockPath = join(repoRoot, LOCK_PATHS.load);

function resolveCommand(command) {
  if (process.platform !== 'win32') return command;
  if (command === 'npx') return 'npx.cmd';
  if (command === 'npm') return 'npm.cmd';
  return command;
}

ensureInactive(
  devLockPath,
  (existing) => `[safety] Refusing to start '${taskName}': dev server is active under PID ${existing.pid}. Stop 'npm run dev' first.`
);
ensureInactive(
  loadLockPath,
  (existing) => `[safety] Refusing to start '${taskName}': load harness is active under PID ${existing.pid}. Wait for 'npm run load:grumps' to finish first.`
);

const existing = readLock(runtimeHeavyLockPath);
if (existing?.pid && processAlive(existing.pid)) {
  console.error(`[safety] Refusing to start '${taskName}': runtime-heavy task '${existing.task || 'unknown'}' is already active under PID ${existing.pid}.`);
  process.exit(1);
}

releaseLock(runtimeHeavyLockPath);
acquireLock(runtimeHeavyLockPath, {
  pid: process.pid,
  task: taskName,
  command: commandParts,
  started_at: new Date().toISOString(),
});
attachLockCleanup(runtimeHeavyLockPath);

const [command, ...args] = commandParts;
const child = spawn(resolveCommand(command), args, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  releaseLock(runtimeHeavyLockPath);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  releaseLock(runtimeHeavyLockPath);
  console.error(`[safety] Failed to start '${taskName}': ${error.message}`);
  process.exit(1);
});