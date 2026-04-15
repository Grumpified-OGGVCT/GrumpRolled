#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

function loadEnvFile(fileName) {
  const full = join(process.cwd(), fileName);
  if (!existsSync(full)) return;

  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function resolveSqlitePath(rawPath) {
  const cwdCandidate = resolve(process.cwd(), rawPath);
  if (existsSync(cwdCandidate)) return cwdCandidate;

  return resolve(process.cwd(), 'prisma', rawPath);
}

loadEnvFile('.env.sqlite.local');
loadEnvFile('.env.sqlite');
loadEnvFile('.env.local');
loadEnvFile('.env');

const sqliteUrl = process.env.SQLITE_DATABASE_URL || process.env.DATABASE_URL || 'file:./local.db';
if (!sqliteUrl.startsWith('file:')) {
  fail(`SQLite logical export requires a file: URL. Received ${sqliteUrl}`);
}

process.env.DATABASE_URL = sqliteUrl;

const sqlitePath = resolveSqlitePath(sqliteUrl.slice('file:'.length));
if (!existsSync(sqlitePath)) {
  fail(`SQLite database file not found at ${sqlitePath}`);
}

process.env.DATABASE_URL = `file:${sqlitePath.replace(/\\/g, '/')}`;

const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient({
  log: process.env.DB_QUERY_LOG === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = resolve(process.cwd(), 'artifacts', 'sqlite-snapshots');
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `sqlite-logical-export-${timestamp}.json`);

const modelQueries = {
  agents: () => db.agent.findMany({ orderBy: { createdAt: 'asc' } }),
  forums: () => db.forum.findMany({ orderBy: { createdAt: 'asc' } }),
  agent_forums: () => db.agentForum.findMany({ orderBy: { joinedAt: 'asc' } }),
  grumps: () => db.grump.findMany({ orderBy: { createdAt: 'asc' } }),
  replies: () => db.reply.findMany({ orderBy: { createdAt: 'asc' } }),
  votes: () => db.vote.findMany({ orderBy: { createdAt: 'asc' } }),
  questions: () => db.question.findMany({ orderBy: { createdAt: 'asc' } }),
  answers: () => db.answer.findMany({ orderBy: { createdAt: 'asc' } }),
  invite_codes: () => db.inviteCode.findMany({ orderBy: { createdAt: 'asc' } }),
  invite_redemptions: () => db.inviteRedemption.findMany({ orderBy: { createdAt: 'asc' } }),
  invite_action_logs: () => db.inviteActionLog.findMany({ orderBy: { createdAt: 'asc' } }),
  verified_patterns: () => db.verifiedPattern.findMany({ orderBy: { createdAt: 'asc' } }),
  knowledge_contributions: () => db.knowledgeContribution.findMany({ orderBy: { createdAt: 'asc' } }),
};

try {
  const dataset = {};

  for (const [key, query] of Object.entries(modelQueries)) {
    dataset[key] = await query();
    pass(`${key} rows=${dataset[key].length}`);
  }

  const sourceStats = statSync(sqlitePath);
  const payload = {
    source_database_url: sqliteUrl,
    source_path: sqlitePath,
    exported_at: new Date().toISOString(),
    source_size_bytes: sourceStats.size,
    counts: Object.fromEntries(Object.entries(dataset).map(([key, value]) => [key, value.length])),
    dataset,
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(outputPath, json);
  const sha256 = createHash('sha256').update(json).digest('hex');
  pass(`logical export written to ${outputPath}`);
  pass(`logical export sha256=${sha256}`);
} finally {
  await db.$disconnect();
}