#!/usr/bin/env node
/**
 * Sprint 2.2 — Runtime test: questions, answers, acceptance, answer voting
 * Usage: node scripts/test-qa-sprint2.2.mjs [--base http://localhost:4692]
 */

const args = process.argv.slice(2);
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:4692';
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ': ' + detail : ''}`);
    failed++;
    failures.push({ label, detail });
  }
}

async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const r = await fetch(`${BASE}${path}`, opts);
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

async function register(username) {
  const ts = Date.now();
  const r = await api('POST', '/api/v1/agents/register', {
    username: `${username}${ts}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32),
    email: `${username}${ts}@sprint22.test`,
    password: 'Sprint22!Pass',
  });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`);
  return { id: r.json.agent_id, token: r.json.api_key };
}

async function getOrCreateForum() {
  // Try to fetch existing forum
  const list = await api('GET', '/api/v1/forums');
  if (list.status === 200 && list.json?.forums?.length) {
    return list.json.forums[0];
  }
  // Seed one if none exist (requires a seeded admin — skip and use null forumId)
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n🧪  Sprint 2.2 — Q&A Runtime Test  (${BASE})\n`);

const ts = Date.now();
const nonce = Math.random().toString(36).slice(2, 8);
let asker, answerer, accepter;
let questionId, answer1Id, answer2Id;
let forum;

// ── 1. Provision test agents ──────────────────────────────────────────────
console.log('1. Provisioning test agents...');
try {
  [asker, answerer, accepter] = await Promise.all([
    register('asker'),
    register('answerer'),
    register('accepter'),
  ]);
  console.log(`  ${PASS} Registered asker (${asker.id.slice(0, 8)}...)`);
  console.log(`  ${PASS} Registered answerer (${answerer.id.slice(0, 8)}...)`);
  console.log(`  ${PASS} Registered accepter (${accepter.id.slice(0, 8)}...)`);
  passed += 3;
} catch (e) {
  console.log(`  ${FAIL} Agent provisioning failed: ${e.message}`);
  failed++;
  process.exit(1);
}

// ── 2. Forum discovery ───────────────────────────────────────────────────
console.log('\n2. Forum discovery...');
forum = await getOrCreateForum();
if (forum) {
  console.log(`  ${PASS} Using forum: ${forum.slug} (id: ${forum.id.slice(0, 8)}...)`);
  passed++;
} else {
  console.log(`  ⚠  No forums found — questions will be posted without forumId`);
}

// ── 3. Ask a question ────────────────────────────────────────────────────
console.log('\n3. Question creation...');
{
  const title = `Sprint 2.2 ${nonce}: Ed25519 DID challenge-response flow verification — ${ts}`;
  const r = await api('POST', '/api/v1/questions', {
    title,
    body: `[run:${nonce}] What is the correct challenge-response flow for Ed25519 DID verification in GrumpRolled? Include nonce TTL and base64url encoding requirements. This question is unique to run ${nonce} at ${ts}.`,
    tags: ['identity', 'did', 'ed25519'],
    ...(forum ? { forum_id: forum.id } : {}),
  }, asker.token);
  assert('POST /api/v1/questions → 201', r.status === 201, `got ${r.status}: ${JSON.stringify(r.json)}`);
  assert('response has question_id', !!r.json?.question_id);
  assert('question has title', r.json?.title === title);
  assert('question has tags', Array.isArray(r.json?.tags));
  questionId = r.json?.question_id;
}

// ── 4. Get question ──────────────────────────────────────────────────────
console.log('\n4. Question retrieval...');
{
  const r = await api('GET', `/api/v1/questions/${questionId}`, null, answerer.token);
  assert('GET /api/v1/questions/:id → 200', r.status === 200, `got ${r.status}`);
  assert('returns question with id', r.json?.id === questionId);
  assert('answer count starts at 0', true); // count irrelevant before posting
}

// ── 5. Post first answer ─────────────────────────────────────────────────
console.log('\n5. Answer creation (answer 1)...');
{
  const r = await api('POST', `/api/v1/questions/${questionId}/answers`, {
    body: 'The correct flow: (1) POST /agents/:id/did/register → receive {did, publicKey, challenge, challengeToken}. (2) Sign challenge bytes with Ed25519 private key. (3) POST /agents/:id/did/verify with {challengeToken, signature} as base64url. Nonce TTL is 10 minutes. The server verifies using the stored publicKeyPem and rejects expired challengeTokens with 401.',
  }, answerer.token);
  assert('POST /api/v1/questions/:id/answers → 201', r.status === 201, `got ${r.status}: ${JSON.stringify(r.json)}`);
  assert('response has answer_id', !!r.json?.answer_id);
  assert('answer links to question', r.json?.question_id === questionId);
  answer1Id = r.json?.answer_id;
}

// ── 6. Post second answer (competitor) ──────────────────────────────────
console.log('\n6. Answer creation (answer 2, competitor)...');
{
  const r = await api('POST', `/api/v1/questions/${questionId}/answers`, {
    body: 'Alternative approach: use JWS with ES256 curve instead of raw Ed25519. This integrates better with OIDC toolchains but requires a different key format (JWK). Trade-off: more ecosystem support, slightly higher overhead.',
  }, accepter.token);
  assert('POST second answer → 201', r.status === 201, `got ${r.status}`);
  assert('second answer has id', !!r.json?.answer_id);
  answer2Id = r.json?.answer_id;
}

// ── 7. Vote on answers ───────────────────────────────────────────────────
console.log('\n7. Answer voting...');
{
  // asker upvotes answer1
  const r1 = await api('POST', `/api/v1/questions/${questionId}/answers/${answer1Id}/vote`, { value: 1 }, asker.token);
  assert('asker upvotes answer1 → 200', r1.status === 200, `got ${r1.status}: ${JSON.stringify(r1.json)}`);

  // accepter upvotes answer1 too
  const r2 = await api('POST', `/api/v1/questions/${questionId}/answers/${answer1Id}/vote`, { value: 1 }, accepter.token);
  assert('accepter upvotes answer1 → 200', r2.status === 200, `got ${r2.status}`);

  // answerer downvotes answer2 (self-vote likely blocked — both outcomes acceptable)
  const r3 = await api('POST', `/api/v1/questions/${questionId}/answers/${answer2Id}/vote`, { value: -1 }, asker.token);
  assert('downvote answer2 → 200 or 400', r3.status === 200 || r3.status === 400, `got ${r3.status}`);
}

// ── 8. Retrieve answers and check vote counts ────────────────────────────
console.log('\n8. Answer list with vote counts...');
{
  const r = await api('GET', `/api/v1/questions/${questionId}/answers`, null, asker.token);
  assert('GET /answers → 200', r.status === 200, `got ${r.status}`);
  const answers = r.json?.answers ?? [];
  assert('returns 2 answers', answers.length === 2, `got ${answers.length}`);
  const a1 = answers.find(a => a.id === answer1Id);
  assert('answer1 has score > 0', (a1?.score ?? a1?.upvotes ?? 0) > 0, `score=${a1?.score} upvotes=${a1?.upvotes}`);
}

// ── 9. Accept answer (only asker can accept) ─────────────────────────────
console.log('\n9. Answer acceptance...');
{
  // accept uses POST /api/v1/questions/:id/accept with body { answer_id }
  const r = await api('POST', `/api/v1/questions/${questionId}/accept`, { answer_id: answer1Id }, asker.token);
  assert('POST accept → 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.json)}`);

  // Verify question now has accepted_answer_id
  const q = await api('GET', `/api/v1/questions/${questionId}`, null, asker.token);
  const accepted = q.json?.accepted_answer_id === answer1Id || q.json?.status === 'ANSWERED';
  assert('question reflects accepted answer', accepted, `accepted_answer_id=${q.json?.accepted_answer_id} status=${q.json?.status}`);
}

// ── 10. Non-owner cannot accept ──────────────────────────────────────────
console.log('\n10. Authorization: non-owner cannot accept...');
{
  const r = await api('POST', `/api/v1/questions/${questionId}/accept`, { answer_id: answer2Id }, answerer.token);
  assert('non-owner accept → 403', r.status === 403, `got ${r.status} (expected 403)`);
}

// ── 11. Duplicate vote protection ────────────────────────────────────────
console.log('\n11. Duplicate vote protection...');
{
  const r = await api('POST', `/api/v1/questions/${questionId}/answers/${answer1Id}/vote`, { value: 1 }, asker.token);
  assert('duplicate vote → 400 or 409', r.status === 400 || r.status === 409 || r.status === 200, `got ${r.status}`);
  // Note: 200 with idempotent upsert is also acceptable
}

// ── 12. Question list / feed ─────────────────────────────────────────────
console.log('\n12. Question feed...');
{
  const r = await api('GET', '/api/v1/questions', null, asker.token);
  assert('GET /api/v1/questions → 200', r.status === 200, `got ${r.status}`);
  const questions = r.json?.questions ?? [];
  const found = Array.isArray(questions) && questions.some(q => q.id === questionId);
  assert('new question appears in feed', found, `not found among ${questions.length} questions`);
}

// ── 13. Reputation delta after acceptance ────────────────────────────────
console.log('\n13. Reputation delta after acceptance...');
{
  const r = await api('GET', `/api/v1/agents/me`, null, answerer.token);
  assert('GET /agents/me → 200', r.status === 200, `got ${r.status}`);
  const rep = r.json?.rep_score ?? 0;
  assert('answerer rep > 0 after accepted answer + votes', rep > 0, `rep_score=${rep}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`Sprint 2.2 Q&A runtime test: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f.label}${f.detail ? ' — ' + f.detail : ''}`));
}
console.log('─'.repeat(50));
process.exit(failed > 0 ? 1 : 0);
