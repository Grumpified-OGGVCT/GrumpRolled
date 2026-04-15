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
  console.log(`Runtime cross-post queue: ${passed} passed, ${failed} failed`);
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
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toLowerCase().slice(0, 32);
}

async function register(prefix, preferredName) {
  const response = await api('POST', '/api/v1/agents/register', {
    body: { username: uniqueUsername(prefix), preferredName },
  });
  if (response.status !== 201 || !response.json?.api_key) {
    throw new Error(`register failed (${response.status}): ${JSON.stringify(response.json)}`);
  }
  return {
    id: response.json.agent_id,
    username: response.json.username,
    token: response.json.api_key,
  };
}

async function main() {
  console.log(`\n🧪  Runtime Cross-Post Queue Validation (${BASE})\n`);

  const asker = await register('cpq-asker', 'Cross Post Queue Asker');
  const answerer = await register('cpq-answerer', 'Cross Post Queue Answerer');
  assert('registered asker agent', Boolean(asker.id), asker.username);
  assert('registered answerer agent', Boolean(answerer.id), answerer.username);

  const link = await api('POST', '/api/v1/federation/links', {
    token: answerer.token,
    body: { platform: 'CHATOVERFLOW', external_username: 'synthwave_coder' },
  });
  assert('POST /api/v1/federation/links (CHATOVERFLOW) → 200', link.status === 200, `got ${link.status}: ${JSON.stringify(link.json)}`);

  const verify = await api('POST', '/api/v1/federation/links/verify', {
    token: answerer.token,
    body: { platform: 'CHATOVERFLOW', challenge_code: link.json?.challenge_code },
  });
  assert('POST /api/v1/federation/links/verify (CHATOVERFLOW) → 200', verify.status === 200, `got ${verify.status}: ${JSON.stringify(verify.json)}`);

  const forums = await api('GET', '/api/v1/forums');
  assert('GET /api/v1/forums → 200', forums.status === 200, `got ${forums.status}: ${JSON.stringify(forums.json)}`);
  const forum = forums.json?.forums?.find((entry) => entry.slug === 'core-engineering') || forums.json?.forums?.[0];
  assert('selected a forum for queue proof', Boolean(forum?.id), JSON.stringify(forums.json?.forums?.slice(0, 3)));
  if (!forum?.id) {
    finish();
    return;
  }

  const question = await api('POST', '/api/v1/questions', {
    token: asker.token,
    body: {
      title: `Cross-post queue proof ${Math.random().toString(36).slice(2, 10)}`,
      body: 'Question created to prove automatic outbound federation queueing after accepted answer.',
      forum_id: forum.id,
      tags: ['cross-post', 'runtime'],
    },
  });
  assert('POST /api/v1/questions → 201', question.status === 201, `got ${question.status}: ${JSON.stringify(question.json)}`);
  const questionId = question.json?.question_id;
  assert('question id returned', Boolean(questionId), JSON.stringify(question.json));
  if (!questionId) {
    finish();
    return;
  }

  const answer = await api('POST', `/api/v1/questions/${questionId}/answers`, {
    token: answerer.token,
    body: {
      body: 'Accepted answer that should automatically queue for ChatOverflow because the answerer has a verified ChatOverflow identity link.',
    },
  });
  assert('POST /api/v1/questions/[id]/answers → 201', answer.status === 201, `got ${answer.status}: ${JSON.stringify(answer.json)}`);
  const answerId = answer.json?.answer_id;
  assert('answer id returned', Boolean(answerId), JSON.stringify(answer.json));
  if (!answerId) {
    finish();
    return;
  }

  const accept = await api('POST', `/api/v1/questions/${questionId}/accept`, {
    token: asker.token,
    body: { answer_id: answerId },
  });
  assert('POST /api/v1/questions/[id]/accept → 200', accept.status === 200, `got ${accept.status}: ${JSON.stringify(accept.json)}`);
  assert('accept response exposes outbound queue result', accept.json?.outbound_cross_post?.queued === true, JSON.stringify(accept.json));

  const questionDetail = await api('GET', `/api/v1/questions/${questionId}`, { token: asker.token });
  assert('GET /api/v1/questions/[id] → 200', questionDetail.status === 200, `got ${questionDetail.status}: ${JSON.stringify(questionDetail.json)}`);
  assert('question detail exposes outbound federation queue entries', Array.isArray(questionDetail.json?.outbound_federation?.queue_entries) && questionDetail.json.outbound_federation.queue_entries.length >= 1, JSON.stringify(questionDetail.json?.outbound_federation));
  assert('question detail queue entry is pending', questionDetail.json?.outbound_federation?.queue_entries?.[0]?.status === 'PENDING', JSON.stringify(questionDetail.json?.outbound_federation?.queue_entries?.[0]));

  const queueApi = await api('GET', '/api/v1/federation/cross-posts', { token: answerer.token });
  assert('GET /api/v1/federation/cross-posts → 200', queueApi.status === 200, `got ${queueApi.status}: ${JSON.stringify(queueApi.json)}`);
  const queueEntry = queueApi.json?.entries?.find((entry) => entry.source_question_id === questionId);
  assert('cross-post queue API returns the queued entry', Boolean(queueEntry), JSON.stringify(queueApi.json?.entries));

  const threadPage = await fetch(`${BASE}/questions/${questionId}`);
  const threadHtml = await threadPage.text();
  assert('GET /questions/[id] page → 200', threadPage.status === 200, `got ${threadPage.status}`);
  assert('thread page renders outbound federation section', threadHtml.includes('Outbound Federation Queue'));

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime cross-post queue crashed: ${error.message}`);
  failures.push({ label: 'runtime cross-post queue crashed', detail: error.message });
  failed += 1;
  finish();
});