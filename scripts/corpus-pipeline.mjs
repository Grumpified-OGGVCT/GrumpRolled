import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { globSync } from 'glob';
import { PrismaClient } from '@prisma/client';

import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

const API_BASE = process.env.GRUMPROLLED_API_BASE || 'http://localhost:4692';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const AUTHOR_ID = process.env.KNOWLEDGE_AUTHOR_ID;
const CORPUS_GLOB = process.env.CORPUS_GLOB || 'data/corpus/*.json';
const CHUNK_SIZE = Math.max(1, Number(process.env.CORPUS_CHUNK || 100));
const DRY_RUN = process.env.CORPUS_DRY_RUN === '1';
const LOCAL_ONLY_DRY_RUN = DRY_RUN && (!ADMIN_API_KEY || !AUTHOR_ID);
const ALLOW_GENERIC_ITEM_ENVELOPES = process.env.CORPUS_ALLOW_GENERIC_ITEM_ENVELOPES === '1';
const VERIFY_STORAGE = process.env.CORPUS_VERIFY_STORAGE !== '0';

function toPosixPath(filePath) {
  return String(filePath).replace(/\\/g, '/');
}

function isAdapterEnvelope(filePath, payload) {
  const normalizedPath = toPosixPath(filePath).toLowerCase();
  return normalizedPath.includes('/grumprolled-') || payload?.generator === 'the-lab-grumprolled-adapter';
}

function isItemEnvelope(payload) {
  return Array.isArray(payload?.items);
}

function isPatternEnvelope(payload) {
  return Array.isArray(payload) || Array.isArray(payload?.patterns);
}

function isLocalApiBase(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

if (!LOCAL_ONLY_DRY_RUN && !ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY is required.');
}
if (!LOCAL_ONLY_DRY_RUN && !AUTHOR_ID) {
  throw new Error('KNOWLEDGE_AUTHOR_ID is required.');
}

function normalizePayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.patterns)) return raw.patterns;
  if (Array.isArray(raw.items)) return raw.items.map(mapCanonicalItemToPattern);
  return [];
}

function normalizeDeltaPayload(raw) {
  if (Array.isArray(raw.items)) return raw.items.map(flattenDeltaItem);
  return [];
}

function flattenDeltaItem(item) {
  const sourceIdentity = item.source_identity || {};
  return {
    ...item,
    source_url: item.source_url || sourceIdentity.url || null,
    source_repo: item.source_repo || sourceIdentity.repo || null,
    source_path: item.source_path || sourceIdentity.path || null,
    source_commit: item.source_commit || sourceIdentity.commit || null,
    source_published_at: item.source_published_at || sourceIdentity.published || null,
    source_fingerprint: item.source_fingerprint || sourceIdentity.source_fingerprint || null,
    is_official: Boolean(item.is_official || sourceIdentity.isOfficial || false),
  };
}

function mapCanonicalItemToPattern(item) {
  const sourceIdentity = item.source_identity || {};
  const descriptionParts = [
    item.primary_mechanism || '',
    item.delta_check?.delta_summary || '',
    item.immediate_project_applicability?.summary || '',
  ].filter(Boolean);

  const tags = Array.isArray(item.topic_tags) ? item.topic_tags : [];
  const patternType = item.mechanism_family ? 'WORKFLOW' : 'BEST_PRACTICE';
  const category = tags.includes('reasoning') ? 'ai-llm' : tags.includes('robotics') ? 'agents' : 'coding';

  return {
    title: item.title,
    description: descriptionParts.join('\n\n').trim(),
    pattern_type: patternType,
    category,
    tags,
    code_snippet: item.architectural_blueprint ? JSON.stringify(item.architectural_blueprint, null, 2) : undefined,
    language: 'json',
    source_repo: item.source_repo || sourceIdentity.repo || null,
    source_path: item.source_path || sourceIdentity.path || null,
    source_commit: item.source_commit || sourceIdentity.commit || null,
    source_url: item.source_url || sourceIdentity.url || null,
    source_fingerprint: item.source_fingerprint || sourceIdentity.source_fingerprint || null,
    is_official: Boolean(item.is_official || sourceIdentity.isOfficial || false),
    fact_check_score: item.scoring?.fact_check_score,
    execution_score: item.scoring?.execution_score,
    citation_score: item.scoring?.citation_score,
    expert_score: item.scoring?.expert_score,
    community_score: item.scoring?.community_score,
    novelty_class: item.delta_check?.status || null,
    delta_summary: item.delta_check?.delta_summary || null,
    provenance: {
      generator: item.generator || null,
      source_identity: sourceIdentity,
      source_fingerprint: item.source_fingerprint || sourceIdentity.source_fingerprint || null,
      topic_fingerprint: item.topic_fingerprint || null,
      mechanism_fingerprint: item.mechanism_fingerprint || null,
      mechanism_family: item.mechanism_family || null,
      review_state: item.review_state || null,
      builder_decision_recommendation: item.builder_decision_recommendation || null,
      recurrence: item.recurrence || null,
    },
  };
}

function contentHash(pattern) {
  const base = `${pattern.title || ''}\n${pattern.description || ''}\n${pattern.code_snippet || ''}`
    .trim()
    .toLowerCase();
  return createHash('sha256').update(base).digest('hex');
}

const files = globSync(CORPUS_GLOB, { windowsPathsNoEscape: true });
if (files.length === 0) {
  console.log(`No corpus files matched '${CORPUS_GLOB}'.`);
  process.exit(0);
}

const loadedFiles = files.map((file) => ({
  file,
  payload: JSON.parse(readFileSync(resolve(file), 'utf8')),
}));

const adapterEnvelopeFiles = loadedFiles.filter(({ file, payload }) => isItemEnvelope(payload) && isAdapterEnvelope(file, payload));
const genericEnvelopeFiles = loadedFiles.filter(({ file, payload }) => isItemEnvelope(payload) && !isAdapterEnvelope(file, payload));
const selectedItemEnvelopeFiles = adapterEnvelopeFiles.length > 0 ? adapterEnvelopeFiles : genericEnvelopeFiles;

if (genericEnvelopeFiles.length > 0 && !ALLOW_GENERIC_ITEM_ENVELOPES) {
  const rejectedFiles = genericEnvelopeFiles.map(({ file }) => toPosixPath(file));
  const guidance = adapterEnvelopeFiles.length > 0
    ? 'Adapter envelopes are present, so narrow CORPUS_GLOB to the adapter artifact or set CORPUS_ALLOW_GENERIC_ITEM_ENVELOPES=1 only for deliberate mixed-ingest debugging.'
    : 'Use a GrumpRolled adapter envelope such as grumprolled-YYYY-MM-DD.json, or set CORPUS_ALLOW_GENERIC_ITEM_ENVELOPES=1 only for explicit compatibility runs.';
  throw new Error(`Generic item envelopes are rejected by default: ${rejectedFiles.join(', ')}. ${guidance}`);
}

const unsupportedFiles = loadedFiles
  .filter(({ payload }) => !isItemEnvelope(payload) && !isPatternEnvelope(payload))
  .map(({ file }) => toPosixPath(file));

if (unsupportedFiles.length > 0) {
  throw new Error(`Unsupported corpus envelope files: ${unsupportedFiles.join(', ')}.`);
}

const merged = [];
const mergedDeltas = [];
for (const { file, payload } of loadedFiles) {
  const shouldUseItemEnvelope = !isItemEnvelope(payload) || selectedItemEnvelopeFiles.some((entry) => entry.file === file);
  const patterns = normalizePayload(payload);
  const deltas = shouldUseItemEnvelope ? normalizeDeltaPayload(payload) : [];
  const selectedPatterns = shouldUseItemEnvelope ? patterns : [];
  merged.push(...selectedPatterns);
  mergedDeltas.push(
    ...deltas.map((delta) => ({
      run_id: payload.run_id || null,
      source_family: payload.source_family || null,
      generator: payload.generator || null,
      item: delta,
    }))
  );
}

const deduped = [];
const seen = new Set();
for (const p of merged) {
  const hash = contentHash(p);
  if (seen.has(hash)) continue;
  seen.add(hash);
  deduped.push(p);
}

console.log(`Corpus files: ${files.length}`);
if (adapterEnvelopeFiles.length > 0) {
  console.log(`Item envelope selection: adapter files preferred (${adapterEnvelopeFiles.length} selected, ${genericEnvelopeFiles.length} skipped)`);
} else if (genericEnvelopeFiles.length > 0) {
  console.log(`Item envelope selection: no adapter files found (${genericEnvelopeFiles.length} generic envelope files selected)`);
}
console.log(`Patterns loaded: ${merged.length}`);
console.log(`Patterns after local dedupe: ${deduped.length}`);
console.log(`Knowledge delta items loaded: ${mergedDeltas.length}`);

async function verifyStoragePresence() {
  if (DRY_RUN || !VERIFY_STORAGE) {
    return;
  }

  if (!isLocalApiBase(API_BASE)) {
    console.log('Storage verification skipped: API base is not local.');
    return;
  }

  loadPreferredPostgresEnv();
  const db = new PrismaClient();
  const expectedPatternHashes = [...new Set(deduped.map(contentHash).filter(Boolean))];
  const expectedDeltaFingerprints = [...new Set(mergedDeltas.map((entry) => entry.item?.source_fingerprint).filter(Boolean))];

  try {
    const [storedPatterns, storedDeltas] = await Promise.all([
      expectedPatternHashes.length > 0
        ? db.verifiedPattern.findMany({
            where: { contentHash: { in: expectedPatternHashes } },
            select: { contentHash: true },
          })
        : Promise.resolve([]),
      expectedDeltaFingerprints.length > 0
        ? db.knowledgeDelta.findMany({
            where: { sourceFingerprint: { in: expectedDeltaFingerprints } },
            select: { sourceFingerprint: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const storedPatternHashes = new Set(storedPatterns.map((entry) => entry.contentHash).filter(Boolean));
    const storedDeltaFingerprints = new Set(storedDeltas.map((entry) => entry.sourceFingerprint).filter(Boolean));

    const missingPatternHashes = expectedPatternHashes.filter((hash) => !storedPatternHashes.has(hash));
    const missingDeltaFingerprints = expectedDeltaFingerprints.filter((fingerprint) => !storedDeltaFingerprints.has(fingerprint));

    console.log(
      `Storage verification: patterns present=${storedPatternHashes.size}/${expectedPatternHashes.length}; deltas present=${storedDeltaFingerprints.size}/${expectedDeltaFingerprints.length}`
    );

    if (missingPatternHashes.length > 0 || missingDeltaFingerprints.length > 0) {
      throw new Error(
        `Storage verification failed. Missing patterns=${missingPatternHashes.length} missing deltas=${missingDeltaFingerprints.length}`
      );
    }
  } finally {
    await db.$disconnect();
  }
}

if (LOCAL_ONLY_DRY_RUN) {
  const samplePattern = deduped[0] || null;
  const sampleDelta = mergedDeltas[0]?.item || null;
  console.log('Local dry run only: skipping API import because ADMIN_API_KEY or KNOWLEDGE_AUTHOR_ID is not set.');
  console.log(
    JSON.stringify(
      {
        dry_run: true,
        local_only: true,
        corpus_files: files,
        pattern_count: deduped.length,
        delta_count: mergedDeltas.length,
        pattern_sample: samplePattern
          ? {
              title: samplePattern.title,
              source_fingerprint: samplePattern.source_fingerprint,
              novelty_class: samplePattern.novelty_class,
              has_provenance: Boolean(samplePattern.provenance),
              has_mechanism_fingerprint: Boolean(samplePattern.provenance?.mechanism_fingerprint),
            }
          : null,
        delta_sample: sampleDelta
          ? {
              title: sampleDelta.title,
              source_fingerprint: sampleDelta.source_fingerprint,
              status: sampleDelta.delta_check?.status || null,
              source_url: sampleDelta.source_url,
              source_published_at: sampleDelta.source_published_at,
            }
          : null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

let imported = 0;
let rejected = 0;
let duplicates = 0;
let deltaImported = 0;
let deltaRejected = 0;
let deltaDuplicates = 0;

for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
  const chunk = deduped.slice(i, i + CHUNK_SIZE);

  const res = await fetch(`${API_BASE}/api/v1/knowledge/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      author_id: AUTHOR_ID,
      auto_verify: true,
      dry_run: DRY_RUN,
      patterns: chunk,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`Chunk failed at index ${i}:`, data);
    continue;
  }

  imported += data.imported || 0;
  rejected += data.rejected_count || 0;
  duplicates += data.duplicate_count || 0;
  console.log(
    `Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: imported=${data.imported} rejected=${data.rejected_count} duplicates=${data.duplicate_count || 0}`
  );
}

for (let i = 0; i < mergedDeltas.length; i += CHUNK_SIZE) {
  const chunk = mergedDeltas.slice(i, i + CHUNK_SIZE);
  const res = await fetch(`${API_BASE}/api/v1/knowledge/deltas/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      author_id: AUTHOR_ID,
      dry_run: DRY_RUN,
      run_id: chunk[0]?.run_id || null,
      source_family: chunk[0]?.source_family || null,
      generator: chunk[0]?.generator || null,
      items: chunk.map((entry) => entry.item),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`Delta chunk failed at index ${i}:`, data);
    continue;
  }

  deltaImported += data.imported || 0;
  deltaRejected += data.rejected_count || 0;
  deltaDuplicates += data.duplicate_count || 0;
  console.log(
    `Delta chunk ${Math.floor(i / CHUNK_SIZE) + 1}: imported=${data.imported} rejected=${data.rejected_count} duplicates=${data.duplicate_count || 0}`
  );
}

console.log(
  `Corpus pipeline complete: patterns imported=${imported} rejected=${rejected} duplicates=${duplicates}; deltas imported=${deltaImported} rejected=${deltaRejected} duplicates=${deltaDuplicates} dry_run=${DRY_RUN}`
);

await verifyStoragePresence();
