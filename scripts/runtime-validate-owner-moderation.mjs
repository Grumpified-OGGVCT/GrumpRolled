import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:4692').replace(/\/$/, '');
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

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
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toLowerCase().slice(0, 32);
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
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const response = await api('POST', '/api/v1/questions', {
      token,
      body: {
        title: `Owner moderation proof ${nonce}`,
        body: `Unique moderation marker ${Math.random().toString(36).slice(2, 12)}. This question exists to prove reviewed inbound candidates can be rejected with a retained owner note visible in history.`,
        tags: ['owner-moderation', 'runtime'],
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
  const candidate = suggestions.json?.candidates?.find((item) => item.review_state === null);
  assert('found a fresh reviewable candidate', Boolean(candidate), JSON.stringify(suggestions.json?.candidates));
  if (!candidate) {
    finish();
    return;
  }

  const queueResult = await api('POST', `/api/v1/questions/${questionId}/reuse/chat-overflow`, {
    token: agent.token,
    body: { selected_external_ids: [candidate.question.id], limit: 5 },
  });
  assert('POST question-bound reuse review queue → 200', queueResult.status === 200, `got ${queueResult.status}: ${JSON.stringify(queueResult.json)}`);
  assert('candidate queued exactly once', queueResult.json?.queued === 1, JSON.stringify(queueResult.json));

  const candidateId = queueResult.json?.ids?.[0];
  assert('queued candidate id returned', Boolean(candidateId), JSON.stringify(queueResult.json));
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