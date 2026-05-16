#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const DEFAULT_BASE = 'https://www.chatoverflow.dev/api';
const ENV_LOCAL_PATH = join(process.cwd(), '.env.local');
const CLI_CONFIG_PATH = join(homedir(), '.config', 'chatoverflow', 'chatoverflow.json');

function fingerprint(value) {
  if (!value) return 'none';
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function generateUsername() {
  const suffix = randomBytes(4).toString('hex');
  return `grbridge-${suffix}`;
}

function backupFile(filePath) {
  if (!existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup.${stamp}`;
  copyFileSync(filePath, backupPath);
  return backupPath;
}

function upsertEnvValue(filePath, key, value) {
  const line = `${key}="${value}"`;
  const contents = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const lines = contents ? contents.split(/\r?\n/) : [];
  let replaced = false;

  const nextLines = lines.map((entry) => {
    if (entry.trim().startsWith(`${key}=`)) {
      replaced = true;
      return line;
    }
    return entry;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(line);
  }

  writeFileSync(filePath, `${nextLines.join('\n').replace(/\n*$/, '\n')}`, 'utf8');
}

async function postJson(baseUrl, path, payload, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function getJson(baseUrl, path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  });

  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function registerWorker(baseUrl, requestedUsername) {
  let last = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = attempt === 0 && requestedUsername ? requestedUsername : generateUsername();
    const result = await postJson(baseUrl, '/auth/register', { username });
    if (result.status === 200 && result.json?.api_key) {
      return {
        username: result.json?.user?.username || username,
        apiKey: result.json.api_key,
        response: result,
      };
    }
    if (result.status === 422 || result.status === 409) {
      last = result;
      continue;
    }
    throw new Error(`register failed (${result.status}): ${JSON.stringify(result.json)}`);
  }

  throw new Error(`register failed after retries: ${JSON.stringify(last?.json || null)}`);
}

async function validateToken(baseUrl, apiKey) {
  return getJson(baseUrl, '/users/me', {
    Authorization: `Bearer ${apiKey}`,
  });
}

function writeCliConfig(filePath, apiKey, apiBaseUrl) {
  mkdirSync(dirname(filePath), { recursive: true });
  const payload = {
    api_key: apiKey,
    api_url: apiBaseUrl,
  };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const baseUrl = (process.env.CHATOVERFLOW_WRITE_API_BASE || DEFAULT_BASE).trim() || DEFAULT_BASE;
  const requestedUsername = process.argv.includes('--username') ? process.argv[process.argv.indexOf('--username') + 1] : '';

  const forumId = (process.env.CHATOVERFLOW_WRITE_FORUM_ID || '').trim();
  if (!forumId) {
    throw new Error('CHATOVERFLOW_WRITE_FORUM_ID is required before rotating the worker token.');
  }

  const worker = await registerWorker(baseUrl, requestedUsername);
  const validation = await validateToken(baseUrl, worker.apiKey);
  if (validation.status !== 200) {
    throw new Error(`worker token validation failed (${validation.status}): ${JSON.stringify(validation.json)}`);
  }

  const envBackup = backupFile(ENV_LOCAL_PATH);
  const cliBackup = backupFile(CLI_CONFIG_PATH);

  upsertEnvValue(ENV_LOCAL_PATH, 'CHATOVERFLOW_WRITE_API_KEY', worker.apiKey);
  upsertEnvValue(ENV_LOCAL_PATH, 'CHATOVERFLOW_WRITE_API_BASE', baseUrl);
  writeCliConfig(CLI_CONFIG_PATH, worker.apiKey, baseUrl);

  console.log(`registered_username=${worker.username}`);
  console.log(`api_base=${baseUrl}`);
  console.log(`token_fingerprint=${fingerprint(worker.apiKey)}`);
  console.log(`forum_id_present=${String(Boolean(forumId))}`);
  console.log(`env_updated=${String(true)}`);
  console.log(`cli_updated=${String(true)}`);
  console.log(`env_backup=${envBackup || 'none'}`);
  console.log(`cli_backup=${cliBackup || 'none'}`);
}

main().catch((error) => {
  console.error(`rotate_chatoverflow_write_worker_failed=${error.message}`);
  process.exitCode = 1;
});
