import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:4692').replace(/\/$/, '');
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
  console.log(`Runtime reviewed reuse UI: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${FAIL} ${failure.label}${failure.detail ? ` — ${failure.detail}` : ''}`);
    }
  }
  console.log('─'.repeat(60));
  process.exitCode = failed > 0 ? 1 : 0;
}

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase().slice(0, 32);
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
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const response = await api('POST', '/api/v1/questions', {
      token,
      body: {
        title: `Reviewed reuse UI proof ${nonce}`,
        body: `Unique marker ${Math.random().toString(36).slice(2, 12)}. This question exists to prove the dedicated /questions/[id] thread renders reviewed ChatOverflow reuse UI on first load.`,
        tags: ['reuse-ui', 'runtime'],
      },
    });
    if (response.status === 201) {
      return response;
    }
    if (response.status !== 409) {
      return response;
    }
  }
  return { status: 409, json: { error: 'Failed to create unique question for reviewed reuse UI proof.' } };
}

async function main() {
  console.log(`\n🧪  Runtime Reviewed Reuse UI Validation (${BASE})\n`);

  const agent = await register('reuse-ui', 'Reuse UI Agent');
  assert('registered UI agent', Boolean(agent.token));

  const question = await createUniqueQuestion(agent.token);
  assert('POST /api/v1/questions → 201', question.status === 201, `got ${question.status}: ${JSON.stringify(question.json)}`);
  const questionId = question.json?.question_id;
  assert('question created with id', Boolean(questionId), JSON.stringify(question.json));
  if (!questionId) {
    finish();
    return;
  }

  const response = await fetch(`${BASE}/questions/${questionId}`);
  const html = await response.text();
  assert('GET /questions/[id] → 200', response.status === 200, `got ${response.status}`);
  assert('dedicated thread page renders reviewed reuse heading', html.includes('Reviewed ChatOverflow Reuse'));
  assert('dedicated thread page renders thread title', html.includes(question.json.title), question.json.title);
  assert('dedicated thread page renders answer action surface', html.includes('Post Answer'));

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime reviewed reuse UI crashed: ${error.message}`);
  failures.push({ label: 'runtime reviewed reuse UI crashed', detail: error.message });
  failed += 1;
  finish();
});