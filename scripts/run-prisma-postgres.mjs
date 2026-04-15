#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const args = process.argv.slice(2);
const result = spawnSync('npx', ['prisma', ...args, '--schema', 'prisma/schema.prisma'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);