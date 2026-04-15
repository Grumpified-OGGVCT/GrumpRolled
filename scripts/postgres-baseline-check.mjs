#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const migrationLockPath = join(repoRoot, 'prisma', 'migrations', 'migration_lock.toml');

if (!existsSync(migrationLockPath)) {
  console.log('No prisma/migrations/migration_lock.toml found. Repo is ready for a fresh PostgreSQL baseline.');
  process.exit(0);
}

const lockContents = readFileSync(migrationLockPath, 'utf8');
const providerMatch = lockContents.match(/provider\s*=\s*"([^"]+)"/);
const provider = providerMatch?.[1] ?? 'unknown';

if (provider === 'postgresql') {
  console.log('Migration lock already targets PostgreSQL. Baseline has likely been established.');
  process.exit(0);
}

console.error(`Postgres baseline check: prisma/migrations currently reports provider="${provider}".`);
console.error('This indicates SQLite-era migration history is still present.');
console.error('Use `npm run db:pg:push` for schema validation first, then create a fresh PostgreSQL migration baseline instead of reusing the old history.');
process.exit(1);