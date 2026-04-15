import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readAdminSessionFromRequest } from '@/lib/session';

let cachedAdminKey: string | null | undefined;

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^['"]/, '').replace(/['"]$/, '').trim();
}

export function getConfiguredAdminKey(): string | null {
  if (typeof cachedAdminKey !== 'undefined') {
    return cachedAdminKey;
  }

  if (process.env.ADMIN_API_KEY) {
    cachedAdminKey = normalizeEnvValue(process.env.ADMIN_API_KEY);
    return cachedAdminKey;
  }

  if (process.env.NODE_ENV !== 'production') {
    const fallbackFiles = [
      join(process.cwd(), '.env.local'),
      join(process.cwd(), '.env.postgres.local'),
      join(process.cwd(), '.env'),
    ];

    for (const filePath of fallbackFiles) {
      if (!existsSync(filePath)) continue;
      const match = readFileSync(filePath, 'utf8').match(/^ADMIN_API_KEY\s*=\s*(.+)$/m);
      if (match?.[1]) {
        cachedAdminKey = normalizeEnvValue(match[1]);
        return cachedAdminKey;
      }
    }
  }

  cachedAdminKey = null;
  return cachedAdminKey;
}

export function validateAdminKey(provided: string): boolean {
  const configured = getConfiguredAdminKey();
  if (!configured) return false;

  return Boolean(provided && provided === configured);
}

export function isAdminRequest(requestOrHeaders: Headers | { headers: Headers; cookies: { get(name: string): { value: string } | undefined } }): boolean {
  const headers = requestOrHeaders instanceof Headers ? requestOrHeaders : requestOrHeaders.headers;

  if (validateAdminKey(headers.get('x-admin-key') || '')) {
    return true;
  }

  if (requestOrHeaders instanceof Headers) {
    return false;
  }

  return Boolean(readAdminSessionFromRequest(requestOrHeaders));
}
