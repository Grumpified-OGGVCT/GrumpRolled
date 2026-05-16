#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const strict = process.argv.includes('--ci') || process.argv.includes('--strict');

const failures = [];
const warnings = [];

const suspiciousRepoFiles = [
  '.claude/router_runtime.js',
  '.claude/setup.mjs',
  '.vscode/tasks.json',
  '.local/bin/gh-token-monitor.sh',
  'Library/LaunchAgents/com.user.gh-token-monitor.plist',
];

const riskyWorkflowPatterns = [
  { pattern: /pull_request_target/, message: 'workflow uses pull_request_target' },
  { pattern: /id-token:\s*write/, message: 'workflow grants id-token: write' },
  { pattern: /actions\/cache@/i, message: 'workflow uses actions/cache' },
  { pattern: /cache:\s*["']?(npm|pnpm|yarn)["']?/i, message: 'workflow enables package-manager cache' },
];

const compromisedPackagePatterns = [
  { pattern: /"node-ipc"[\s\S]{0,200}"version":\s*"(?:9\.1\.6|9\.2\.3|12\.0\.1)"/i, message: 'lockfile references compromised node-ipc version' },
  { pattern: /node-ipc@(9\.1\.6|9\.2\.3|12\.0\.1)/i, message: 'lockfile references compromised node-ipc version' },
  { pattern: /"@tanstack\/setup"/i, message: 'lockfile references @tanstack/setup' },
];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function listWorkflowFiles() {
  const workflowDir = join(repoRoot, '.github', 'workflows');
  if (!existsSync(workflowDir)) return [];
  return readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => join(workflowDir, name));
}

function scanWorkflows() {
  for (const file of listWorkflowFiles()) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(repoRoot, file);

    for (const entry of riskyWorkflowPatterns) {
      if (entry.pattern.test(content)) {
        if (entry.message.includes('pull_request_target') || entry.message.includes('id-token: write')) {
          fail(`${rel}: ${entry.message}`);
        } else {
          warn(`${rel}: ${entry.message}`);
        }
      }
    }

    if (/uses:\s*actions\/checkout@/i.test(content) && !/persist-credentials:\s*false/i.test(content)) {
      warn(`${rel}: checkout does not set persist-credentials: false`);
    }

    if (!/permissions:/i.test(content)) {
      warn(`${rel}: workflow does not declare explicit top-level permissions`);
    }
  }
}

function scanRepoFiles() {
  for (const relPath of suspiciousRepoFiles) {
    const abs = join(repoRoot, relPath);
    if (existsSync(abs)) {
      fail(`suspicious persistence-like file present: ${relPath}`);
    }
  }
}

function scanLockfiles() {
  const candidates = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'];
  for (const relPath of candidates) {
    const abs = join(repoRoot, relPath);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, 'utf8');
    for (const entry of compromisedPackagePatterns) {
      if (entry.pattern.test(content)) {
        fail(`${relPath}: ${entry.message}`);
      }
    }
  }
}

function scanTrackedManifest() {
  const packageJsonPath = join(repoRoot, 'package.json');
  if (!existsSync(packageJsonPath)) return;
  const content = readFileSync(packageJsonPath, 'utf8');
  if (/"@tanstack\/setup"/i.test(content)) {
    fail('package.json declares @tanstack/setup');
  }
}

function scanUnexpectedTopLevelFiles() {
  const entries = readdirSync(repoRoot);
  for (const name of entries) {
    if (!name.startsWith('.')) continue;
    if (['.git', '.github', '.gitignore', '.env.example', '.env.local.example', '.claude'].includes(name)) continue;
    const abs = join(repoRoot, name);
    try {
      const stats = statSync(abs);
      if (stats.isFile() && /^(\.profile|\.zshrc|\.bashrc)$/i.test(name)) {
        warn(`unexpected shell dotfile at repo root: ${name}`);
      }
    } catch {
      // ignore unreadable entries
    }
  }
}

function printLines(title, items, prefix) {
  if (!items.length) return;
  console.log(`\n${title}`);
  for (const item of items) console.log(`  ${prefix} ${item}`);
}

function main() {
  console.log('[supply-chain-guard] scanning repository for known IOC/workflow patterns');
  scanRepoFiles();
  scanLockfiles();
  scanTrackedManifest();
  scanWorkflows();
  scanUnexpectedTopLevelFiles();

  if (!failures.length && !warnings.length) {
    console.log('[supply-chain-guard] no known IOC or workflow risk patterns detected');
    return;
  }

  printLines('Failures', failures, '✗');
  printLines('Warnings', warnings, '⚠');

  if (failures.length || (strict && warnings.length)) {
    process.exitCode = 1;
    console.error(`\n[supply-chain-guard] failed (${failures.length} failures, ${warnings.length} warnings${strict ? ', strict mode' : ''})`);
    return;
  }

  console.log(`\n[supply-chain-guard] completed with ${warnings.length} warnings`);
}

main();
