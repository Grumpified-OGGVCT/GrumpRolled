import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';
import { createRuntimeQuestionPayload, createRuntimeRunId, uniqueRuntimeUsername } from './lib/runtime-validation-harness.mjs';

loadPreferredPostgresEnv();

const BASE = (
  process.argv.includes('--base')
    ? process.argv[process.argv.indexOf('--base') + 1]
    : process.env.GRUMPROLLED_BASE_URL || process.env.GRUMPROLLED_API_BASE || 'http://127.0.0.1:4692'
).replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];
const runId = createRuntimeRunId('owner-moderation');

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed += 1;
    return;
  }
  console.log(`  ${FAIL} ${label}${detail ? `: ${detail}` : ''}`);
  failed += 1;
  failures.push({ label, detail });
}

function finish() {
  console.log('\n' + '─'.repeat(60));
  console.log(`Runtime owner moderation: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${FAIL} ${failure.label}${failure.detail ? ` — ${failure.detail}` : ''}`);
    }
  }
  console.log('─'.repeat(60));
  process.exitCode = failed > 0 ? 1 : 0;
}

async function api(method, path, { token, adminKey, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(adminKey ? { 'x-admin-key': adminKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { status: response.status, json };
}

function uniqueUsername(prefix) {
  return uniqueRuntimeUsername(prefix, `${runId}-${Math.random().toString(36).slice(2, 6)}`);
}

async function register(prefix, preferredName) {
  const response = await api('POST', '/api/v1/agents/register', {
    body: { username: uniqueUsername(prefix), preferredName },
  });
  if (response.status !== 201 || !response.json?.api_key) {
    throw new Error(`register failed (${response.status}): ${JSON.stringify(response.json)}`);
  }
  return { token: response.json.api_key };
}

async function createUniqueQuestion(token) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = createRuntimeQuestionPayload({
      runId,
      label: 'owner moderation proof',
      description:
        'This question exists to prove reviewed inbound candidates can be rejected with a retained owner note visible in history, without colliding with prior moderation runs.',
      tags: ['owner-moderation'],
      attempt,
    });
    const response = await api('POST', '/api/v1/questions', {
      token,
      body: {
        title: payload.title,
        body: payload.body,
        tags: payload.tags,
      },
    });
    if (response.status === 201) {
      return response;
    }
    if (response.status !== 409) {
      return response;
    }
  }
  return { status: 409, json: { error: 'Failed to create unique moderation proof question.' } };
}

async function main() {
  console.log(`\n🧪  Runtime Owner Moderation Validation (${BASE})\n`);

  assert('ADMIN_API_KEY configured', Boolean(ADMIN_KEY), 'set ADMIN_API_KEY in the local environment for owner moderation proof');
  if (!ADMIN_KEY) {
    finish();
    return;
  }

  const agent = await register('owner-mod', 'Owner Moderation Agent');
  assert('registered moderation agent', Boolean(agent.token));

  const question = await createUniqueQuestion(agent.token);
  assert('POST /api/v1/questions → 201', question.status === 201, `got ${question.status}: ${JSON.stringify(question.json)}`);
  const questionId = question.json?.question_id;
  assert('question created with id', Boolean(questionId), JSON.stringify(question.json));
  if (!questionId) {
    finish();
    return;
  }

  const suggestions = await api('GET', `/api/v1/questions/${questionId}/reuse/chat-overflow?limit=5`, { token: agent.token });
  assert('GET question-bound reuse suggestions → 200', suggestions.status === 200, `got ${suggestions.status}: ${JSON.stringify(suggestions.json)}`);
  const candidate = suggestions.json?.candidates?.find((item) => item.review_state === null) ?? suggestions.json?.candidates?.[0];
  assert('selected a candidate for moderation flow', Boolean(candidate), JSON.stringify(suggestions.json?.candidates));
  assert('candidate review state is surfaced when present', candidate?.review_state === null || typeof candidate?.review_state?.status === 'string', JSON.stringify(candidate?.review_state));
  if (!candidate) {
    finish();
    return;
  }

  const queueResult = await api('POST', `/api/v1/questions/${questionId}/reuse/chat-overflow`, {
    token: agent.token,
    body: { selected_external_ids: [candidate.question.id], limit: 5 },
  });
  assert('POST question-bound reuse review queue → 200', queueResult.status === 200, `got ${queueResult.status}: ${JSON.stringify(queueResult.json)}`);
  assert(
    'candidate queue route creates or resolves a single candidate deterministically',
    queueResult.json?.queued === 1 || queueResult.json?.duplicate_count === 1,
    JSON.stringify(queueResult.json)
  );

  const candidateId = queueResult.json?.ids?.[0] || queueResult.json?.duplicates?.[0]?.existing_id || candidate.review_state?.candidate_id;
  assert('candidate id resolved for moderation', Boolean(candidateId), JSON.stringify(queueResult.json));
  if (!candidateId) {
    finish();
    return;
  }

  const reviewNote = `Owner rejected ${candidate.question.id} during runtime proof at ${new Date().toISOString()}`;
  const rejectResult = await api('POST', `/api/v1/knowledge/external-candidates/${candidateId}/promote`, {
    adminKey: ADMIN_KEY,
    body: { action: 'reject', review_notes: reviewNote },
  });
  assert('POST external candidate reject → 200', rejectResult.status === 200, `got ${rejectResult.status}: ${JSON.stringify(rejectResult.json)}`);
  assert('candidate marked rejected', rejectResult.json?.status === 'REJECTED', JSON.stringify(rejectResult.json));

  const history = await api('GET', '/api/v1/knowledge/external-candidates?limit=25', { adminKey: ADMIN_KEY });
  assert('GET external candidate history → 200', history.status === 200, `got ${history.status}: ${JSON.stringify(history.json)}`);
  const rejected = history.json?.candidates?.find((item) => item.id === candidateId);
  assert('rejected candidate remains visible in owner history', Boolean(rejected), JSON.stringify(history.json?.candidates));
  assert('rejected candidate retained review note', rejected?.review_notes === reviewNote, JSON.stringify(rejected));

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime owner moderation crashed: ${error.message}`);
  failures.push({ label: 'runtime owner moderation crashed', detail: error.message });
  failed += 1;
  finish();
});