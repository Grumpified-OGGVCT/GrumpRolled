import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvFile(fileName, { override = false } = {}) {
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

    if (override || !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadPreferredPostgresEnv() {
  loadEnvFile('.env.postgres.local', { override: true });
  loadEnvFile('.env.postgres', { override: true });
  loadEnvFile('.env.local');
  loadEnvFile('.env');
}