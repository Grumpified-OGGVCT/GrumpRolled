import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:4692').replace(/\/$/, '');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const adminKey = process.env.ADMIN_API_KEY || null;

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
  console.log(`Runtime ChatOverflow review: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${FAIL} ${failure.label}${failure.detail ? ` — ${failure.detail}` : ''}`);
    }
  }
  console.log('─'.repeat(60));
  process.exitCode = failed > 0 ? 1 : 0;
}

async function api(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
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
  return {
    id: response.json.agent_id,
    username: response.json.username,
    token: response.json.api_key,
  };
}

async function createUniqueQuestion(token) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const marker = Math.random().toString(36).slice(2, 12);
    const response = await api('POST', '/api/v1/questions', {
      token,
      body: {
        title: `Review proof ${nonce} for external candidate queue routing`,
        body: `Unique marker ${marker}. Validate a reviewed inbound reuse path that can queue ChatOverflow candidates, preserve provenance, expose review state, and allow downstream promotion without mutating local question state.`,
        tags: ['reuse', 'review', 'federation', `run-${attempt}`],
      },
    });

    if (response.status === 201) {
      return response;
    }

    if (response.status !== 409) {
      return response;
    }
  }

  return { status: 409, json: { error: 'Failed to create unique reuse-review question after retries.' } };
}

async function main() {
  console.log(`\n🧪  Runtime ChatOverflow Review Validation (${BASE})\n`);

  const agent = await register('reuse-review', 'Reuse Review Agent');
  assert('registered review agent', Boolean(agent.id), agent.username);

  const questionCreate = await createUniqueQuestion(agent.token);
  assert('POST /api/v1/questions → 201', questionCreate.status === 201, `got ${questionCreate.status}: ${JSON.stringify(questionCreate.json)}`);

  const questionId = questionCreate.json?.question_id;
  assert('question created with id', Boolean(questionId), JSON.stringify(questionCreate.json));
  if (!questionId) {
    finish();
    return;
  }

  const suggestions = await api('GET', `/api/v1/questions/${questionId}/reuse/chat-overflow?limit=3`, { token: agent.token });
  assert('GET question-bound reuse suggestions → 200', suggestions.status === 200, `got ${suggestions.status}: ${JSON.stringify(suggestions.json)}`);
  assert('reuse mode is REVIEW_THEN_IMPORT', suggestions.json?.import_mode === 'REVIEW_THEN_IMPORT', JSON.stringify(suggestions.json));
  assert('suggestions returned candidates', Array.isArray(suggestions.json?.candidates) && suggestions.json.candidates.length > 0, JSON.stringify(suggestions.json?.candidates));

  const selected = suggestions.json?.candidates?.find((candidate) => candidate.review_state === null) ?? suggestions.json?.candidates?.[0];
  assert('selected candidate available for review flow', Boolean(selected), JSON.stringify(suggestions.json?.candidates));
  assert('candidate review state is surfaced when present', selected?.review_state === null || typeof selected?.review_state?.status === 'string', JSON.stringify(selected?.review_state));

  const queueResult = await api('POST', `/api/v1/questions/${questionId}/reuse/chat-overflow`, {
    token: agent.token,
    body: {
      limit: 3,
      selected_external_ids: [selected.question.id],
    },
  });
  assert('POST question-bound reuse review queue → 200', queueResult.status === 200, `got ${queueResult.status}: ${JSON.stringify(queueResult.json)}`);
  assert(
    'queue route either creates or detects reviewed candidate deterministically',
    queueResult.json?.queued === 1 || queueResult.json?.duplicate_count === 1,
    JSON.stringify(queueResult.json)
  );

  const candidateList = await api('GET', '/api/v1/knowledge/external-candidates?source_platform=CHATOVERFLOW&limit=10', { token: agent.token });
  assert('GET /api/v1/knowledge/external-candidates → 200', candidateList.status === 200, `got ${candidateList.status}: ${JSON.stringify(candidateList.json)}`);
  const existingCandidateId = queueResult.json?.ids?.[0] || queueResult.json?.duplicates?.[0]?.existing_id || selected?.review_state?.candidate_id;
  const queuedCandidate = candidateList.json?.candidates?.find((candidate) => candidate.id === existingCandidateId || candidate.source_external_id === selected.question.id);
  assert('queued candidate visible in owned candidate list', Boolean(queuedCandidate), JSON.stringify(candidateList.json?.candidates));
  assert(
    'candidate status is queued or already imported on rerun',
    ['QUEUED', 'IMPORTED_PATTERN', 'DUPLICATE'].includes(queuedCandidate?.status),
    JSON.stringify(queuedCandidate)
  );
  assert(
    'candidate review note or prior review state is retained',
    (typeof queuedCandidate?.review_notes === 'string' && queuedCandidate.review_notes.length > 0) || Boolean(selected?.review_state),
    JSON.stringify(queuedCandidate)
  );

  const refreshedSuggestions = await api('GET', `/api/v1/questions/${questionId}/reuse/chat-overflow?limit=3`, { token: agent.token });
  const refreshed = refreshedSuggestions.json?.candidates?.find((candidate) => candidate.question.id === selected.question.id);
  assert(
    'refreshed suggestions surface review state',
    ['QUEUED', 'IMPORTED_PATTERN', 'DUPLICATE'].includes(refreshed?.review_state?.status),
    JSON.stringify(refreshed?.review_state)
  );

  if (adminKey) {
    if (queuedCandidate?.status === 'QUEUED') {
      const promote = await api('POST', `/api/v1/knowledge/external-candidates/${queuedCandidate.id}/promote`, {
        headers: { 'x-admin-key': adminKey },
        body: { action: 'promote' },
      });
      assert('admin candidate promote route → 200', promote.status === 200, `got ${promote.status}: ${JSON.stringify(promote.json)}`);
      assert('candidate promoted as pattern', Boolean(promote.json?.promotion?.patternId), JSON.stringify(promote.json));

      const finalSuggestions = await api('GET', `/api/v1/questions/${questionId}/reuse/chat-overflow?limit=3`, { token: agent.token });
      const promoted = finalSuggestions.json?.candidates?.find((candidate) => candidate.question.id === selected.question.id);
      assert('suggestions now show imported pattern state', promoted?.review_state?.status === 'IMPORTED_PATTERN', JSON.stringify(promoted?.review_state));
    } else {
      assert('rerun preserved already reviewed candidate state', ['IMPORTED_PATTERN', 'DUPLICATE'].includes(queuedCandidate?.status), JSON.stringify(queuedCandidate));
    }
  } else {
    assert('admin key available for promotion proof', false, 'ADMIN_API_KEY not configured for local promotion proof');
  }

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime ChatOverflow review crashed: ${error.message}`);
  failures.push({ label: 'runtime ChatOverflow review crashed', detail: error.message });
  failed += 1;
  finish();
});