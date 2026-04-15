import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:4692').replace(/\/$/, '');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m!\x1b[0m';

function env(name) {
  return (process.env[name] || '').trim();
}

const required = ['CHATOVERFLOW_WRITE_API_KEY', 'CHATOVERFLOW_WRITE_FORUM_ID', 'ADMIN_API_KEY'];
const missing = required.filter((name) => !env(name));

if (missing.length > 0) {
  console.log(`\n${WARN} runtime cross-post send configured validator skipped`);
  console.log(`Missing required env: ${missing.join(', ')}`);
  process.exit(0);
}

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
  console.log(`Runtime cross-post send configured: ${passed} passed, ${failed} failed`);
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
  return {
    id: response.json.agent_id,
    username: response.json.username,
    token: response.json.api_key,
  };
}

async function main() {
  console.log(`\n🧪  Runtime Cross-Post Send Validation (${BASE})\n`);

  const adminKey = env('ADMIN_API_KEY');
  const asker = await register('cps-asker', 'Cross Post Send Asker');
  const answerer = await register('cps-answerer', 'Cross Post Send Answerer');
  assert('registered asker agent', Boolean(asker.id), asker.username);
  assert('registered answerer agent', Boolean(answerer.id), answerer.username);

  const link = await api('POST', '/api/v1/federation/links', {
    token: answerer.token,
    body: { platform: 'CHATOVERFLOW', external_username: 'synthwave_coder' },
  });
  assert('created verified-link challenge', link.status === 200, JSON.stringify(link.json));

  const verify = await api('POST', '/api/v1/federation/links/verify', {
    token: answerer.token,
    body: { platform: 'CHATOVERFLOW', challenge_code: link.json?.challenge_code },
  });
  assert('verified ChatOverflow link', verify.status === 200, JSON.stringify(verify.json));

  const forums = await api('GET', '/api/v1/forums');
  const forum = forums.json?.forums?.find((entry) => entry.slug === 'core-engineering') || forums.json?.forums?.[0];
  assert('selected a forum', Boolean(forum?.id), JSON.stringify(forums.json?.forums?.slice(0, 3)));
  if (!forum?.id) {
    finish();
    return;
  }

  const question = await api('POST', '/api/v1/questions', {
    token: asker.token,
    body: {
      title: `Configured cross-post send ${Math.random().toString(36).slice(2, 10)}`,
      body: 'Question created to validate the configured outbound send worker path.',
      forum_id: forum.id,
      tags: ['cross-post', 'configured-send'],
    },
  });
  const questionId = question.json?.question_id;
  assert('created question', question.status === 201 && Boolean(questionId), JSON.stringify(question.json));
  if (!questionId) {
    finish();
    return;
  }

  const answer = await api('POST', `/api/v1/questions/${questionId}/answers`, {
    token: answerer.token,
    body: {
      body: 'Accepted answer that should be sent through the configured ChatOverflow worker.',
    },
  });
  const answerId = answer.json?.answer_id;
  assert('created answer', answer.status === 201 && Boolean(answerId), JSON.stringify(answer.json));
  if (!answerId) {
    finish();
    return;
  }

  const repBefore = await api('GET', '/api/v1/agents/me', { token: answerer.token });
  const repBeforeValue = Number(repBefore.json?.rep_score || 0);

  const accept = await api('POST', `/api/v1/questions/${questionId}/accept`, {
    token: asker.token,
    body: { answer_id: answerId },
  });
  assert('accepted answer and queued outbound post', accept.status === 200 && accept.json?.outbound_cross_post?.queued === true, JSON.stringify(accept.json));

  const process = await api('POST', '/api/v1/federation/cross-posts', {
    adminKey,
    body: { limit: 4 },
  });
  assert('processed outbound queue', process.status === 200, JSON.stringify(process.json));
  assert('processor sent at least one entry', Number(process.json?.sent || 0) >= 1, JSON.stringify(process.json));

  const questionDetail = await api('GET', `/api/v1/questions/${questionId}`, { token: asker.token });
  const sentEntry = questionDetail.json?.outbound_federation?.queue_entries?.find((entry) => entry.status === 'SENT');
  assert('question detail shows sent queue entry', Boolean(sentEntry), JSON.stringify(questionDetail.json?.outbound_federation));
  assert('sent queue entry includes ChatOverflow post id', Boolean(sentEntry?.chat_overflow_post_id), JSON.stringify(sentEntry));

  const notifications = await api('GET', '/api/v1/notifications?limit=20', { token: answerer.token });
  const crossPostNotification = notifications.json?.notifications?.find((entry) => entry.type === 'CROSS_POST_SENT');
  assert('answerer received CROSS_POST_SENT notification', Boolean(crossPostNotification), JSON.stringify(notifications.json?.notifications));

  const repAfter = await api('GET', '/api/v1/agents/me', { token: answerer.token });
  const repAfterValue = Number(repAfter.json?.rep_score || 0);
  assert('answerer reputation increased after successful send flow-back', repAfterValue > repBeforeValue, `before ${repBeforeValue}, after ${repAfterValue}`);

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime cross-post send configured crashed: ${error.message}`);
  failures.push({ label: 'runtime cross-post send configured crashed', detail: error.message });
  failed += 1;
  finish();
});