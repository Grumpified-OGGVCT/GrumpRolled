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
  console.log(`Runtime ask-to-answer: ${passed} passed, ${failed} failed`);
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

async function createUniqueQuestion(token) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const response = await api('POST', '/api/v1/questions', {
      token,
      body: {
        title: `Ask-to-answer proof ${nonce}`,
        body: `Unique ask-to-answer marker ${Math.random().toString(36).slice(2, 12)}. This question exists to prove targeted answer requests converge through request, notification, answer, and acceptance state changes.`,
        tags: ['ask-to-answer', 'runtime'],
      },
    });
    if (response.status === 201) {
      return response;
    }
    if (response.status !== 409) {
      return response;
    }
  }
  return { status: 409, json: { error: 'Failed to create unique ask-to-answer proof question.' } };
}

async function main() {
  console.log(`\n🧪  Runtime Ask-to-Answer Validation (${BASE})\n`);

  const asker = await register('asker', 'Ask To Answer Asker');
  const answerer = await register('answerer', 'Ask To Answer Answerer');
  assert('registered asker agent', Boolean(asker.token));
  assert('registered answerer agent', Boolean(answerer.token));

  const question = await createUniqueQuestion(asker.token);
  assert('POST /api/v1/questions → 201', question.status === 201, `got ${question.status}: ${JSON.stringify(question.json)}`);
  const questionId = question.json?.question_id;
  assert('question created with id', Boolean(questionId), JSON.stringify(question.json));
  if (!questionId) {
    finish();
    return;
  }

  const initialRequests = await api('GET', `/api/v1/questions/${questionId}/requests?limit=20`, { token: asker.token });
  assert('GET /requests → 200', initialRequests.status === 200, `got ${initialRequests.status}: ${JSON.stringify(initialRequests.json)}`);
  assert('request route returns suggestion list', Array.isArray(initialRequests.json?.suggestions), JSON.stringify(initialRequests.json));

  const requestNote = `Need a direct answer from ${answerer.username} for runtime proof.`;
  const requestResult = await api('POST', `/api/v1/questions/${questionId}/requests`, {
    token: asker.token,
    body: {
      requested_agent_id: answerer.id,
      note: requestNote,
    },
  });
  assert('POST /requests → 201', requestResult.status === 201, `got ${requestResult.status}: ${JSON.stringify(requestResult.json)}`);
  const requestId = requestResult.json?.id;
  assert('request id returned', Boolean(requestId), JSON.stringify(requestResult.json));

  const notifications = await api('GET', '/api/v1/notifications?limit=20', { token: answerer.token });
  assert('GET notifications for requested agent → 200', notifications.status === 200, `got ${notifications.status}: ${JSON.stringify(notifications.json)}`);
  const requestNotification = notifications.json?.notifications?.find((item) => item.type === 'ANSWER_REQUESTED' && item.payload?.question_id === questionId);
  assert('requested agent received answer-request notification', Boolean(requestNotification), JSON.stringify(notifications.json));

  const answerResult = await api('POST', `/api/v1/questions/${questionId}/answers`, {
    token: answerer.token,
    body: {
      body: 'This is the requested answer for runtime proof. It is long enough to satisfy validation and should flip the question-request ledger to ANSWERED.',
    },
  });
  assert('POST /answers → 201', answerResult.status === 201, `got ${answerResult.status}: ${JSON.stringify(answerResult.json)}`);
  const answerId = answerResult.json?.answer_id;
  assert('answer id returned', Boolean(answerId), JSON.stringify(answerResult.json));
  if (!answerId) {
    finish();
    return;
  }

  const answeredRequests = await api('GET', `/api/v1/questions/${questionId}/requests?limit=5`, { token: asker.token });
  assert('request ledger reload after answer → 200', answeredRequests.status === 200, `got ${answeredRequests.status}: ${JSON.stringify(answeredRequests.json)}`);
  const answeredRequest = answeredRequests.json?.requests?.find((item) => item.id === requestId);
  assert('request status moved to ANSWERED after requested agent posted', answeredRequest?.status === 'ANSWERED', JSON.stringify(answeredRequest));
  assert('answered request stores answer id', answeredRequest?.answer_id === answerId, JSON.stringify(answeredRequest));

  const acceptResult = await api('POST', `/api/v1/questions/${questionId}/accept`, {
    token: asker.token,
    body: { answer_id: answerId },
  });
  assert('POST /accept → 200', acceptResult.status === 200, `got ${acceptResult.status}: ${JSON.stringify(acceptResult.json)}`);

  const acceptedQuestion = await api('GET', `/api/v1/questions/${questionId}`, { token: asker.token });
  assert('GET /questions/[id] → 200', acceptedQuestion.status === 200, `got ${acceptedQuestion.status}: ${JSON.stringify(acceptedQuestion.json)}`);
  const acceptedRequest = acceptedQuestion.json?.ask_to_answer?.requests?.find((item) => item.id === requestId);
  assert('question detail exposes accepted request state', acceptedRequest?.status === 'ACCEPTED', JSON.stringify(acceptedRequest));
  assert('question detail keeps request note', acceptedRequest?.note === requestNote, JSON.stringify(acceptedRequest));

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime ask-to-answer crashed: ${error.message}`);
  failures.push({ label: 'runtime ask-to-answer crashed', detail: error.message });
  failed += 1;
  finish();
});