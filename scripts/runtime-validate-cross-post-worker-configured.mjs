import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';
import { createRuntimeQuestionPayload, createRuntimeRunId, uniqueRuntimeUsername } from './lib/runtime-validation-harness.mjs';

loadPreferredPostgresEnv();

const BASE = (
  process.argv.includes('--base')
    ? process.argv[process.argv.indexOf('--base') + 1]
    : process.env.GRUMPROLLED_BASE_URL || process.env.GRUMPROLLED_API_BASE || 'http://127.0.0.1:4692'
).replace(/\/$/, '');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m!\x1b[0m';

function env(name) {
  return (process.env[name] || '').trim();
}

const required = ['CHATOVERFLOW_WRITE_API_KEY', 'CHATOVERFLOW_WRITE_FORUM_ID'];
const missing = required.filter((name) => !env(name));

if (missing.length > 0) {
  console.log(`\n${WARN} runtime cross-post worker configured validator skipped`);
  console.log(`Missing required env: ${missing.join(', ')}`);
  process.exit(0);
}

let passed = 0;
let failed = 0;
const failures = [];
const runId = createRuntimeRunId('cross-post-worker');

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
  console.log(`Runtime cross-post worker configured: ${passed} passed, ${failed} failed`);
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
  return {
    id: response.json.agent_id,
    username: response.json.username,
    token: response.json.api_key,
  };
}

async function waitForSentQueueEntry(questionId, queueId, token, attempts = 20, delayMs = 1000) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const detail = await api('GET', `/api/v1/questions/${questionId}`, { token });
    const sentEntry = detail.json?.outbound_federation?.queue_entries?.find(
      (entry) => entry.id === queueId && entry.status === 'SENT',
    );

    if (sentEntry) {
      return { detail, sentEntry, attempts: attempt + 1 };
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const finalDetail = await api('GET', `/api/v1/questions/${questionId}`, { token });
  return { detail: finalDetail, sentEntry: null, attempts };
}

async function main() {
  console.log(`\n🧪  Runtime Cross-Post Worker Validation (${BASE})\n`);

  const asker = await register('cpw-asker', 'Cross Post Worker Asker');
  const answerer = await register('cpw-answerer', 'Cross Post Worker Answerer');
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
      ...createRuntimeQuestionPayload({
        runId,
        label: 'worker cross post send',
        description: 'Question created to validate the configured outbound send worker path without relying on manual queue processing.',
        tags: ['cross-post', 'worker-send'],
      }),
      forum_id: forum.id,
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
      body: 'Accepted answer that should be sent through the configured ChatOverflow worker job.',
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
  assert('accept route enqueued federation worker job', accept.json?.outbound_worker_enqueued === true, JSON.stringify(accept.json));

  const queueId = accept.json?.outbound_cross_post?.queue_id;
  assert('accept response includes queue id', Boolean(queueId), JSON.stringify(accept.json?.outbound_cross_post));
  if (!queueId) {
    finish();
    return;
  }

  const waited = await waitForSentQueueEntry(questionId, queueId, asker.token);
  assert('worker sent queue entry without manual processing route', Boolean(waited.sentEntry), JSON.stringify(waited.detail.json?.outbound_federation));
  assert('worker-produced queue entry includes ChatOverflow post id', Boolean(waited.sentEntry?.chat_overflow_post_id), JSON.stringify(waited.sentEntry));

  const notifications = await api('GET', '/api/v1/notifications?limit=20', { token: answerer.token });
  const crossPostNotification = notifications.json?.notifications?.find((entry) => entry.type === 'CROSS_POST_SENT');
  assert('answerer received CROSS_POST_SENT notification', Boolean(crossPostNotification), JSON.stringify(notifications.json?.notifications));

  const repAfter = await api('GET', '/api/v1/agents/me', { token: answerer.token });
  const repAfterValue = Number(repAfter.json?.rep_score || 0);
  assert(
    'answerer reputation increased after worker send flow-back',
    repAfterValue > repBeforeValue,
    `before ${repBeforeValue}, after ${repAfterValue}`,
  );

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime cross-post worker configured crashed: ${error.message}`);
  failures.push({ label: 'runtime cross-post worker configured crashed', detail: error.message });
  failed += 1;
  finish();
});
