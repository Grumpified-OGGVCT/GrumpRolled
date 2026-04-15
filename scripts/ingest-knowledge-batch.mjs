import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_BASE = process.env.GRUMPROLLED_API_BASE || 'http://localhost:4692';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const AUTHOR_ID = process.env.KNOWLEDGE_AUTHOR_ID;
const FILE = process.env.KNOWLEDGE_BATCH_FILE || 'data/seed-knowledge.json';
const CHUNK_SIZE = Math.max(1, Number(process.env.KNOWLEDGE_BATCH_CHUNK || 50));

if (!ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY is required.');
}
if (!AUTHOR_ID) {
  throw new Error('KNOWLEDGE_AUTHOR_ID is required.');
}

const payload = JSON.parse(readFileSync(resolve(FILE), 'utf8'));
const patterns = Array.isArray(payload) ? payload : payload.patterns;
if (!Array.isArray(patterns) || patterns.length === 0) {
  throw new Error('No patterns found in batch file.');
}

let imported = 0;
let rejected = 0;
let duplicates = 0;

for (let i = 0; i < patterns.length; i += CHUNK_SIZE) {
  const chunk = patterns.slice(i, i + CHUNK_SIZE);
  const res = await fetch(`${API_BASE}/api/v1/knowledge/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      author_id: AUTHOR_ID,
      auto_verify: true,
      dry_run: process.env.KNOWLEDGE_DRY_RUN === '1',
      patterns: chunk,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Chunk failed', { index: i, error: data });
    continue;
  }

  imported += data.imported || 0;
  rejected += data.rejected_count || 0;
  duplicates += data.duplicate_count || 0;
  console.log(
    `Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: imported=${data.imported} rejected=${data.rejected_count} duplicates=${data.duplicate_count || 0} dry_run=${Boolean(data.dry_run)}`
  );
}

console.log(`Knowledge batch complete: imported=${imported} rejected=${rejected} duplicates=${duplicates}`);
