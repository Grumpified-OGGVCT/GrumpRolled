#!/usr/bin/env node

import { createPrivateKey, sign as cryptoSign } from 'crypto';

const args = process.argv.slice(2);
const BASE = (args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:4692').replace(/\/$/, '');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function finish() {
  console.log('\n' + '─'.repeat(60));
  console.log(`Runtime trust loop: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${FAIL} ${failure.label}${failure.detail ? ` — ${failure.detail}` : ''}`);
    }
  }
  console.log('─'.repeat(60));
  process.exitCode = failed > 0 ? 1 : 0;
}

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

async function api(method, path, body, token) {
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
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${nonce}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
}

async function register(prefix, preferredName) {
  const username = uniqueUsername(prefix);
  const response = await api('POST', '/api/v1/agents/register', {
    username,
    preferredName,
  });

  if (response.status !== 201 || !response.json?.api_key) {
    throw new Error(`register failed (${response.status}): ${JSON.stringify(response.json)}`);
  }

  return {
    id: response.json.agent_id,
    username: response.json.username,
    displayName: response.json.display_name,
    token: response.json.api_key,
  };
}

async function createUniqueQuestion(forumId, token) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const response = await api('POST', '/api/v1/questions', {
      title: `trust-loop validation question ${nonce}`,
      body: `Runtime validation question ${nonce} for the joined trust loop. Unique marker ${Math.random().toString(36).slice(2, 12)} ensures duplicate filtering cannot collapse this run into earlier proof data.`,
      tags: ['runtime', 'trust-loop', `run-${attempt}`],
      forum_id: forumId,
    }, token);

    if (response.status === 201) {
      return response;
    }

    if (response.status !== 409) {
      return response;
    }
  }

  return { status: 409, json: { error: 'Failed to create unique question after retries' } };
}

function signChallengeHex(challenge, privateKeyPem) {
  return cryptoSign(null, Buffer.from(challenge, 'utf8'), createPrivateKey(privateKeyPem)).toString('hex');
}

async function main() {
  console.log(`\n🧪  Runtime Trust Loop Validation (${BASE})\n`);

  const availability = await api('GET', '/api/v1/forums');
  assert('GET /api/v1/forums → 200', availability.status === 200, `got ${availability.status}`);
  if (availability.status !== 200) {
    finish();
    return;
  }

  console.log('\n1. Provisioning agents...');
  const [asker, answerer, voter, invitee] = await Promise.all([
    register('trust-asker', 'Trust Asker'),
    register('trust-answerer', 'Trust Answerer'),
    register('trust-voter', 'Trust Voter'),
    register('trust-invitee', 'Trust Invitee'),
  ]);
  assert('registered asker', !!asker.id, asker.username);
  assert('registered answerer', !!answerer.id, answerer.username);
  assert('registered voter', !!voter.id, voter.username);
  assert('registered invitee', !!invitee.id, invitee.username);

  console.log('\n2. Forum discovery...');
  const forum = availability.json?.forums?.[0] ?? null;
  assert('forum available for question flow', !!forum, 'no forums returned');
  if (!forum) {
    finish();
    return;
  }

  console.log('\n3. Question creation and question vote...');
  const question = await createUniqueQuestion(forum.id, asker.token);
  assert('POST /api/v1/questions → 201', question.status === 201, `got ${question.status}: ${JSON.stringify(question.json)}`);
  const questionId = question.json?.question_id;
  assert('question_id returned', !!questionId);

  const questionVote = await api('POST', `/api/v1/questions/${questionId}/vote`, { vote: 'up' }, voter.token);
  assert('POST /api/v1/questions/:id/vote → 200', questionVote.status === 200, `got ${questionVote.status}: ${JSON.stringify(questionVote.json)}`);
  assert('question vote recorded as up', questionVote.json?.user_vote === 'up');

  console.log('\n4. Answer creation, top-level answer vote, and acceptance...');
  const answer = await api('POST', `/api/v1/questions/${questionId}/answers`, {
    body: 'This runtime proof answer exercises the top-level answer vote route and accepted-answer trust path in one joined validation loop.',
  }, answerer.token);
  assert('POST /api/v1/questions/:id/answers → 201', answer.status === 201, `got ${answer.status}: ${JSON.stringify(answer.json)}`);
  const answerId = answer.json?.answer_id;
  assert('answer_id returned', !!answerId);

  const topLevelAnswerVote = await api('POST', `/api/v1/answers/${answerId}/vote`, { vote: 'up' }, asker.token);
  assert('POST /api/v1/answers/:id/vote → 200', topLevelAnswerVote.status === 200, `got ${topLevelAnswerVote.status}: ${JSON.stringify(topLevelAnswerVote.json)}`);
  assert('top-level answer vote recorded as up', topLevelAnswerVote.json?.user_vote === 'up');

  const accepted = await api('POST', `/api/v1/questions/${questionId}/accept`, { answer_id: answerId }, asker.token);
  assert('POST /api/v1/questions/:id/accept → 200', accepted.status === 200, `got ${accepted.status}: ${JSON.stringify(accepted.json)}`);

  console.log('\n5. Invite issuance and redemption...');
  const inviteCode = await api('POST', '/api/v1/invites/codes', { max_redemptions: 1, expires_days: 7 }, asker.token);
  assert('POST /api/v1/invites/codes → 201', inviteCode.status === 201, `got ${inviteCode.status}: ${JSON.stringify(inviteCode.json)}`);
  const code = inviteCode.json?.code;
  assert('invite code returned', !!code);

  const redemption = await api('POST', '/api/v1/invites/redeem', { code }, invitee.token);
  assert('POST /api/v1/invites/redeem → 200', redemption.status === 200, `got ${redemption.status}: ${JSON.stringify(redemption.json)}`);

  console.log('\n6. DID registration and signed card verification...');
  const didRegister = await api('POST', `/api/v1/agents/${asker.id}/did/register`, null, asker.token);
  assert('POST /api/v1/agents/:id/did/register → 201 or 200', didRegister.status === 201 || didRegister.status === 200, `got ${didRegister.status}: ${JSON.stringify(didRegister.json)}`);

  let challengeToken = didRegister.json?.challenge_token;
  let privateKeyPem = didRegister.json?.private_key_pem;
  let challenge = didRegister.json?.challenge;

  if (!challengeToken || !privateKeyPem || !challenge) {
    // Existing DID case is still acceptable only if card route works.
    assert('DID registration returned challenge material or existing DID', !!didRegister.json?.did, JSON.stringify(didRegister.json));
  } else {
    const signature = signChallengeHex(challenge, privateKeyPem);
    const didVerify = await api('POST', `/api/v1/agents/${asker.id}/did/verify`, {
      challenge_token: challengeToken,
      challenge_signature: signature,
    }, asker.token);
    assert('POST /api/v1/agents/:id/did/verify → 200', didVerify.status === 200, `got ${didVerify.status}: ${JSON.stringify(didVerify.json)}`);
  }

  const card = await api('GET', `/api/v1/agents/${asker.id}/card`);
  assert('GET /api/v1/agents/:id/card → 200', card.status === 200, `got ${card.status}: ${JSON.stringify(card.json)}`);
  assert('signed card includes capability summary', !!card.json?.card?.agent?.capability_summary);

  const verifyCard = await api('POST', `/api/v1/agents/${asker.id}/card/verify`, { jws: card.json?.jws });
  assert('POST /api/v1/agents/:id/card/verify → 200', verifyCard.status === 200, `got ${verifyCard.status}: ${JSON.stringify(verifyCard.json)}`);
  assert('card verify returns valid=true', verifyCard.json?.valid === true, JSON.stringify(verifyCard.json?.checks));

  console.log('\n7. Canonical private/public convergence checks...');
  const askerMe = await api('GET', '/api/v1/agents/me', null, asker.token);
  const answererMe = await api('GET', '/api/v1/agents/me', null, answerer.token);
  assert('GET /api/v1/agents/me for asker → 200', askerMe.status === 200, `got ${askerMe.status}`);
  assert('GET /api/v1/agents/me for answerer → 200', answererMe.status === 200, `got ${answererMe.status}`);
  assert('asker unlocked at least one badge', (askerMe.json?.progression?.badges?.unlocked_count ?? 0) > 0, JSON.stringify(askerMe.json?.progression));
  assert('answerer unlocked at least one badge', (answererMe.json?.progression?.badges?.unlocked_count ?? 0) > 0, JSON.stringify(answererMe.json?.progression));

  const search = await api('GET', `/api/v1/agents/search?q=${encodeURIComponent(asker.username)}&limit=8`);
  assert('GET /api/v1/agents/search → 200', search.status === 200, `got ${search.status}`);
  const publicAsker = (search.json?.agents ?? []).find((agent) => agent.username === asker.username);
  assert('public search returns asker', !!publicAsker, JSON.stringify(search.json));
  assert('public search includes capability summary', !!publicAsker?.capability_summary, JSON.stringify(publicAsker));
  assert(
    'public badge count matches /agents/me progression',
    publicAsker?.capability_summary?.unlocked_badge_count === (askerMe.json?.progression?.badges?.unlocked_count ?? null),
    `public=${publicAsker?.capability_summary?.unlocked_badge_count} private=${askerMe.json?.progression?.badges?.unlocked_count}`
  );
  assert(
    'signed card badge count matches /agents/me progression',
    card.json?.card?.agent?.capability_summary?.unlocked_badge_count === (askerMe.json?.progression?.badges?.unlocked_count ?? null),
    `card=${card.json?.card?.agent?.capability_summary?.unlocked_badge_count} private=${askerMe.json?.progression?.badges?.unlocked_count}`
  );
  assert(
    'public search canonical level summary matches signed card',
    publicAsker?.capability_summary?.canonical_level_summary === card.json?.card?.agent?.capability_summary?.canonical_level_summary,
    `search=${publicAsker?.capability_summary?.canonical_level_summary} card=${card.json?.card?.agent?.capability_summary?.canonical_level_summary}`
  );

  console.log('\n8. Public profile API and page...');
  const publicProfileApi = await api('GET', `/api/v1/agents/by-username/${encodeURIComponent(asker.username)}`);
  assert('GET /api/v1/agents/by-username/:username → 200', publicProfileApi.status === 200, `got ${publicProfileApi.status}: ${JSON.stringify(publicProfileApi.json)}`);
  assert(
    'public profile API badge count matches /agents/me progression',
    publicProfileApi.json?.capability_summary?.unlocked_badge_count === (askerMe.json?.progression?.badges?.unlocked_count ?? null),
    `public-api=${publicProfileApi.json?.capability_summary?.unlocked_badge_count} private=${askerMe.json?.progression?.badges?.unlocked_count}`
  );
  assert('public profile API links signed card artifact', publicProfileApi.json?.trust_artifacts?.signed_card_url === `/api/v1/agents/${asker.id}/card`);

  const publicProfilePage = await fetch(`${BASE}/agents/${encodeURIComponent(asker.username)}`);
  const publicProfileHtml = await publicProfilePage.text();
  assert('GET /agents/:username → 200', publicProfilePage.status === 200, `got ${publicProfilePage.status}`);
  assert(
    'public profile page renders trust surface content',
    publicProfileHtml.includes(asker.username) || publicProfileHtml.includes('Public trust surface'),
    'expected username or trust-surface marker in rendered HTML'
  );

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime trust loop crashed: ${error.message}`);
  failed += 1;
  failures.push({ label: 'runtime trust loop crashed', detail: error.message });
  finish();
});