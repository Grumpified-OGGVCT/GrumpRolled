#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const canonicalSchemaPath = join(repoRoot, 'prisma', 'schema.prisma');
const generatedSchemaPath = join(repoRoot, 'prisma', 'generated', 'schema.sqlite.prisma');

const canonical = readFileSync(canonicalSchemaPath, 'utf8');
const sqliteSchema = canonical
  .replace('provider = "postgresql"', 'provider = "sqlite"')
  .replace(/\s*directUrl = env\("DIRECT_URL"\)\r?\n/, '\n');

mkdirSync(dirname(generatedSchemaPath), { recursive: true });
writeFileSync(
  generatedSchemaPath,
  [
    '// Generated fallback schema for SQLite smoke mode only.',
    '// Do not edit manually. Update prisma/schema.prisma instead.',
    sqliteSchema,
  ].join('\n\n')
);

console.log(`SQLite fallback schema generated at ${generatedSchemaPath}`);