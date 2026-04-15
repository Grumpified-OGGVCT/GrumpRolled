#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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
  if (isAbsolute(rawPath)) return rawPath;

  const cwdCandidate = resolve(process.cwd(), rawPath);
  if (existsSync(cwdCandidate)) return cwdCandidate;

  return resolve(process.cwd(), 'prisma', rawPath);
}

loadEnvFile('.env.sqlite.local');
loadEnvFile('.env.sqlite');
loadEnvFile('.env.local');
loadEnvFile('.env');

const databaseUrl = process.env.SQLITE_DATABASE_URL || process.env.DATABASE_URL || 'file:./local.db';

if (!databaseUrl.startsWith('file:')) {
  fail(`DATABASE_URL must use a SQLite file: URL for snapshot export. Received ${databaseUrl}`);
}

const rawPath = databaseUrl.slice('file:'.length);
const sourcePath = resolveSqlitePath(rawPath);

if (!existsSync(sourcePath)) {
  fail(`SQLite database file not found at ${sourcePath}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = resolve(process.cwd(), 'artifacts', 'sqlite-snapshots');
mkdirSync(outputDir, { recursive: true });

const snapshotBase = `sqlite-snapshot-${timestamp}`;
const snapshotDbPath = join(outputDir, `${snapshotBase}.db`);
const snapshotManifestPath = join(outputDir, `${snapshotBase}.json`);

copyFileSync(sourcePath, snapshotDbPath);

const snapshotBuffer = readFileSync(snapshotDbPath);
const fileHash = createHash('sha256').update(snapshotBuffer).digest('hex');
const stats = statSync(snapshotDbPath);

const manifest = {
  source_database_url: databaseUrl,
  source_path: sourcePath,
  snapshot_path: snapshotDbPath,
  size_bytes: stats.size,
  sha256: fileHash,
  exported_at: new Date().toISOString(),
};

writeFileSync(snapshotManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

pass(`SQLite snapshot exported to ${snapshotDbPath}`);
pass(`Manifest written to ${snapshotManifestPath}`);