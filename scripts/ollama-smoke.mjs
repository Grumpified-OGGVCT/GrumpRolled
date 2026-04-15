import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const baseUrl = process.env.OLLAMA_API_BASE_URL || 'https://ollama.com/api';
const key = process.env.OLLAMA_API_KEY_1 || process.env.OLLAMA_API_KEY_2 || process.env.OLLAMA_API_KEY;

if (!key) {
  console.log('SKIP: no OLLAMA_API_KEY_1/2 or OLLAMA_API_KEY set.');
  process.exit(0);
}

async function run() {
  const tagsRes = await fetch(`${baseUrl}/tags`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!tagsRes.ok) {
    const body = await tagsRes.text();
    console.error(`FAIL: /tags returned ${tagsRes.status}`);
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  const tags = await tagsRes.json();
  const models = Array.isArray(tags?.models) ? tags.models : [];
  console.log(`PASS: /tags responded OK. model_count=${models.length}`);

  if (models.length === 0) {
    console.log('WARN: no models returned; skipping /show smoke.');
    process.exit(0);
  }

  const first = models[0]?.model || models[0]?.name;
  if (!first) {
    console.log('WARN: model object missing name/model; skipping /show smoke.');
    process.exit(0);
  }

  const showRes = await fetch(`${baseUrl}/show`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: first }),
  });

  if (!showRes.ok) {
    const body = await showRes.text();
    console.error(`FAIL: /show returned ${showRes.status} for model=${first}`);
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  console.log(`PASS: /show responded OK for model=${first}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('FAIL: unhandled error during Ollama smoke test');
  console.error(err);
  process.exit(1);
});
