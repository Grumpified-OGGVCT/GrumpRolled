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
  console.log(`Runtime trust routing: ${passed} passed, ${failed} failed`);
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

async function linkAndVerify(token, platform, externalUsername) {
  const created = await api('POST', '/api/v1/federation/links', {
    token,
    body: { platform, external_username: externalUsername },
  });
  assert(`POST /api/v1/federation/links (${platform}) → 200`, created.status === 200, `got ${created.status}: ${JSON.stringify(created.json)}`);
  assert(`${platform} challenge issued`, typeof created.json?.challenge_code === 'string', JSON.stringify(created.json));
  if (!created.json?.challenge_code) {
    return null;
  }

  const verified = await api('POST', '/api/v1/federation/links/verify', {
    token,
    body: { platform, challenge_code: created.json.challenge_code },
  });
  assert(`POST /api/v1/federation/links/verify (${platform}) → 200`, verified.status === 200, `got ${verified.status}: ${JSON.stringify(verified.json)}`);
  assert(`${platform} summary returned on verify`, Boolean(verified.json?.summary?.profile), JSON.stringify(verified.json));
  return verified.json;
}

async function getForums() {
  const response = await api('GET', '/api/v1/forums');
  assert('GET /api/v1/forums → 200', response.status === 200, `got ${response.status}: ${JSON.stringify(response.json)}`);
  return response.json?.forums || [];
}

async function createUniqueQuestion(token, forumId, forumName) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const response = await api('POST', '/api/v1/questions', {
      token,
      body: {
        title: `Trust routing proof ${nonce}`,
        body: `Unique trust-routing marker ${Math.random().toString(36).slice(2, 12)}. This question exists to prove reviewed intake visibility and federated answer routing inside ${forumName}.`,
        forum_id: forumId,
        tags: ['trust-routing', 'runtime'],
      },
    });
    if (response.status === 201) {
      return response;
    }
    if (response.status !== 409) {
      return response;
    }
  }
  return { status: 409, json: { error: 'Failed to create unique trust-routing proof question.' } };
}

async function main() {
  console.log(`\n🧪  Runtime Trust Routing Validation (${BASE})\n`);

  const asker = await register('trust-asker', 'Trust Routing Asker');
  const trusted = await register('trust-target', 'Trust Routing Target');

  assert('registered asker agent', Boolean(asker.id), asker.username);
  assert('registered trusted target agent', Boolean(trusted.id), trusted.username);

  await linkAndVerify(trusted.token, 'CHATOVERFLOW', 'synthwave_coder');
  await linkAndVerify(trusted.token, 'MOLTBOOK', 'Starfish');

  const forums = await getForums();
  const selectedForum =
    forums.find((forum) => forum.slug === 'core-engineering')
    || forums.find((forum) => forum.channel_type !== 'DREAM_LAB')
    || forums[0];
  assert('selected a usable forum', Boolean(selectedForum?.id), JSON.stringify(forums.slice(0, 3)));
  if (!selectedForum?.id) {
    finish();
    return;
  }

  const joinResult = await api('POST', `/api/v1/forums/${selectedForum.slug}/join`, { token: trusted.token });
  assert('trusted target joined selected forum', joinResult.status === 201 || joinResult.status === 200, `got ${joinResult.status}: ${JSON.stringify(joinResult.json)}`);

  const question = await createUniqueQuestion(asker.token, selectedForum.id, selectedForum.name);
  assert('POST /api/v1/questions → 201', question.status === 201, `got ${question.status}: ${JSON.stringify(question.json)}`);
  const questionId = question.json?.question_id;
  assert('question created with id', Boolean(questionId), JSON.stringify(question.json));
  if (!questionId) {
    finish();
    return;
  }

  const requestSuggestions = await api('GET', `/api/v1/questions/${questionId}/requests?limit=8`, { token: asker.token });
  assert('GET /api/v1/questions/[id]/requests → 200', requestSuggestions.status === 200, `got ${requestSuggestions.status}: ${JSON.stringify(requestSuggestions.json)}`);
  const trustedSuggestion = requestSuggestions.json?.suggestions?.find((item) => item.username === trusted.username);
  assert('suggestions include the verified linked target', Boolean(trustedSuggestion), JSON.stringify(requestSuggestions.json?.suggestions));
  assert('trusted suggestion marks forum match', trustedSuggestion?.matched_forum === true, JSON.stringify(trustedSuggestion));
  assert('trusted suggestion marks verified links', trustedSuggestion?.has_verified_links === true, JSON.stringify(trustedSuggestion));
  assert('trusted suggestion includes linked platform summaries', Array.isArray(trustedSuggestion?.linked_platforms) && trustedSuggestion.linked_platforms.length >= 2 && trustedSuggestion.linked_platforms.every((link) => link.summary?.profile), JSON.stringify(trustedSuggestion));
  assert('trusted suggestion reason reflects federated or combined trust', typeof trustedSuggestion?.reason === 'string' && /federated|cross-platform/i.test(trustedSuggestion.reason), JSON.stringify(trustedSuggestion));

  const reuseSuggestions = await api('GET', `/api/v1/questions/${questionId}/reuse/chat-overflow?limit=4`, { token: asker.token });
  assert('GET reviewed reuse suggestions → 200', reuseSuggestions.status === 200, `got ${reuseSuggestions.status}: ${JSON.stringify(reuseSuggestions.json)}`);
  assert('reviewed reuse returns candidates', Array.isArray(reuseSuggestions.json?.candidates) && reuseSuggestions.json.candidates.length > 0, JSON.stringify(reuseSuggestions.json));

  const selectedExternalId = reuseSuggestions.json?.candidates?.[0]?.question?.id;
  assert('selected an external candidate id for queueing', Boolean(selectedExternalId), JSON.stringify(reuseSuggestions.json?.candidates?.[0]));
  if (!selectedExternalId) {
    finish();
    return;
  }

  const queueResult = await api('POST', `/api/v1/questions/${questionId}/reuse/chat-overflow`, {
    token: asker.token,
    body: { selected_external_ids: [selectedExternalId], limit: 4 },
  });
  assert('POST reviewed reuse queue route → 200', queueResult.status === 200, `got ${queueResult.status}: ${JSON.stringify(queueResult.json)}`);

  const questionDetail = await api('GET', `/api/v1/questions/${questionId}`, { token: asker.token });
  assert('GET /api/v1/questions/[id] → 200', questionDetail.status === 200, `got ${questionDetail.status}: ${JSON.stringify(questionDetail.json)}`);
  assert('question detail exposes participant-visible reviewed intake summary', questionDetail.json?.inbound_reuse?.participant_summary?.summary_status === 'AVAILABLE', JSON.stringify(questionDetail.json?.inbound_reuse));
  const queuedCandidate = questionDetail.json?.inbound_reuse?.participant_summary?.candidates?.find((candidate) => candidate.external_id === selectedExternalId);
  assert('question detail round-trips queued review state', Boolean(queuedCandidate?.review_state), JSON.stringify(queuedCandidate));

  const discoverySearch = await api('GET', `/api/v1/agents/search?q=${encodeURIComponent(trusted.username)}&limit=8`);
  assert('GET /api/v1/agents/search → 200', discoverySearch.status === 200, `got ${discoverySearch.status}: ${JSON.stringify(discoverySearch.json)}`);
  const discoveryAgent = discoverySearch.json?.agents?.find((entry) => entry.username === trusted.username);
  assert('discovery search returns the trusted target', Boolean(discoveryAgent), JSON.stringify(discoverySearch.json?.agents));
  assert('discovery search exposes linked platform summaries for trust badges', Array.isArray(discoveryAgent?.linked_platforms) && discoveryAgent.linked_platforms.length >= 2 && discoveryAgent.linked_platforms.every((link) => link.summary?.profile), JSON.stringify(discoveryAgent));

  const threadPage = await fetch(`${BASE}/questions/${questionId}`);
  const threadHtml = await threadPage.text();
  assert('GET /questions/[id] page → 200', threadPage.status === 200, `got ${threadPage.status}`);
  assert('thread page renders reviewed intake section heading', threadHtml.includes('Thread-Level Reviewed External Intake'));
  assert('thread page renders ask-to-answer section heading', threadHtml.includes('Ask-to-Answer Routing'));

  const discoveryPage = await fetch(`${BASE}/questions/discovery`);
  const discoveryHtml = await discoveryPage.text();
  assert('GET /questions/discovery page → 200', discoveryPage.status === 200, `got ${discoveryPage.status}`);
  assert('discovery page renders Top Agents surface', discoveryHtml.includes('Top Agents'));

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime trust routing crashed: ${error.message}`);
  failures.push({ label: 'runtime trust routing crashed', detail: error.message });
  failed += 1;
  finish();
});