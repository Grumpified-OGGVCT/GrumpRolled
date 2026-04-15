#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

function getArgumentValue(flagName) {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === flagName) {
      return args[index + 1] || null;
    }
    const prefix = `${flagName}=`;
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return null;
}

function hasFlag(flagName) {
  return process.argv.slice(2).includes(flagName);
}

function getRunDate() {
  const explicit = getArgumentValue('--date') || process.env.LAB_RUN_DATE || process.env.RUN_DATE || process.env.TEST_DATE;
  if (explicit) return explicit;
  return new Date().toISOString().slice(0, 10);
}

function toPosixPath(filePath) {
  return String(filePath).replace(/\\/g, '/');
}

function runStep(label, command, args, options = {}) {
  console.log(`▶ ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

async function assertApiReachable(baseUrl) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/forums`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GrumpRolled API is not reachable at ${baseUrl}. Start the local API before running corpus handoff. Root cause: ${message}`);
  }
}

function detectPythonCommand() {
  const candidates = [
    { command: 'py', args: ['-3', '--version'], runArgs: ['-3'] },
    { command: 'python', args: ['--version'], runArgs: [] },
    { command: 'python3', args: ['--version'], runArgs: [] },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      stdio: 'ignore',
      shell: false,
    });
    if (result.status === 0) {
      return candidate;
    }
  }

  throw new Error('No usable Python command found. Tried py -3, python, and python3.');
}

loadPreferredPostgresEnv();

const upstreamRoot = resolve(process.env.LAB_UPSTREAM_ROOT || 'C:/Users/gerry/Grumpified-AI_Research_Daily');
const runDate = getRunDate();
const authorId = process.env.KNOWLEDGE_AUTHOR_ID || getArgumentValue('--author-id');
const apiBase = process.env.GRUMPROLLED_API_BASE || 'http://localhost:4692';
const dryRunOnly = hasFlag('--dry-run-only') || process.env.CORPUS_HANDOFF_DRY_RUN_ONLY === '1';

if (!existsSync(upstreamRoot)) {
  throw new Error(`Upstream root does not exist: ${upstreamRoot}`);
}

if (!process.env.ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY is required for corpus handoff.');
}

if (!authorId) {
  throw new Error('KNOWLEDGE_AUTHOR_ID is required for corpus handoff.');
}

const python = detectPythonCommand();
const upstreamEnv = {
  ...process.env,
  LAB_RUN_DATE: runDate,
};

const aggregateScript = resolve(upstreamRoot, 'scripts', 'aggregate.py');
const insightsScript = resolve(upstreamRoot, 'scripts', 'mine_insights.py');
const reportScript = resolve(upstreamRoot, 'scripts', 'generate_report.py');
const adapterArtifact = toPosixPath(resolve(upstreamRoot, 'data', 'corpus', `grumprolled-${runDate}.json`));

await assertApiReachable(apiBase);

runStep('Upstream aggregation', python.command, [...python.runArgs, aggregateScript, '--date', runDate], {
  cwd: upstreamRoot,
  env: upstreamEnv,
});
runStep('Upstream insights mining', python.command, [...python.runArgs, insightsScript, '--date', runDate], {
  cwd: upstreamRoot,
  env: upstreamEnv,
});
runStep('Upstream report generation', python.command, [...python.runArgs, reportScript, '--date', runDate], {
  cwd: upstreamRoot,
  env: upstreamEnv,
});

if (!existsSync(resolve(adapterArtifact))) {
  throw new Error(`Expected adapter artifact was not produced: ${adapterArtifact}`);
}

const downstreamEnv = {
  ...process.env,
  KNOWLEDGE_AUTHOR_ID: authorId,
  GRUMPROLLED_API_BASE: apiBase,
  CORPUS_GLOB: adapterArtifact,
};

runStep('Downstream API dry-run', process.execPath, ['scripts/corpus-pipeline.mjs'], {
  cwd: process.cwd(),
  env: {
    ...downstreamEnv,
    CORPUS_DRY_RUN: '1',
  },
});

if (!dryRunOnly) {
  runStep('Downstream real import', process.execPath, ['scripts/corpus-pipeline.mjs'], {
    cwd: process.cwd(),
    env: {
      ...downstreamEnv,
      CORPUS_DRY_RUN: '',
    },
  });
} else {
  console.log('ℹ Downstream real import skipped because --dry-run-only was set.');
}

console.log(`✔ Corpus handoff complete for ${runDate} using ${adapterArtifact} dry_run_only=${dryRunOnly}`);