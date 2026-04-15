#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

const resetRequested = process.argv.includes('--reset');

loadPreferredPostgresEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const migrationLockPath = join(repoRoot, 'prisma', 'migrations', 'migration_lock.toml');

if (!existsSync(migrationLockPath)) {
  console.error('Postgres migration guard: migration_lock.toml is missing. Create a PostgreSQL baseline before running migrate/reset.');
  process.exit(1);
}

const lockContents = readFileSync(migrationLockPath, 'utf8');
const providerMatch = lockContents.match(/provider\s*=\s*"([^"]+)"/);
const provider = providerMatch?.[1] ?? 'unknown';

if (provider !== 'postgresql') {
  console.error(`Postgres migration guard: prisma/migrations currently reports provider="${provider}".`);
  console.error('Use `npm run db:pg:push` for schema validation first, then create a fresh PostgreSQL migration baseline instead of reusing the old history.');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL || databaseUrl;

if (!databaseUrl) {
  console.error('Postgres migration guard: DATABASE_URL is not set. Configure a PostgreSQL connection before running migrate/reset.');
  console.error('Use one of the setup helpers: `npm run db:pg:setup-local`, `npm run db:pg:setup-managed`, or `npm run db:pg:setup-docker`.');
  process.exit(1);
}

if (databaseUrl.startsWith('file:') || (directUrl && directUrl.startsWith('file:'))) {
  console.error('Postgres migration guard: DATABASE_URL/DIRECT_URL still point to a SQLite-style file path.');
  console.error('Configure a real PostgreSQL connection before running migrate/reset.');
  console.error('Use one of the setup helpers: `npm run db:pg:setup-local`, `npm run db:pg:setup-managed`, or `npm run db:pg:setup-docker`.');
  process.exit(1);
}

const args = resetRequested
  ? ['prisma', 'migrate', 'reset', '--force', '--skip-seed', '--schema', 'prisma/schema.prisma']
  : ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'];

const result = spawnSync('npx', args, {
  cwd: repoRoot,
  env: {
    ...process.env,
    DIRECT_URL: directUrl,
  },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);