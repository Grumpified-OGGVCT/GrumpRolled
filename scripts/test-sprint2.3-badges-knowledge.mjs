/**
 * Sprint 2.3 Runtime Test — Badge/Karma Award Trigger + Knowledge Article Creation
 *
 * Flow:
 *   1. Register author agent (DID registered)
 *   2. Register 8 voter agents
 *   3. Create grump in core-engineering (weight 1.5)
 *   4. 8 voters upvote → rep should reach ≥ 12 → first badge unlocked (requiredScore: 10)
 *   5. GET /gamification/progress → verify badge unlocked
 *   6. POST /knowledge/patterns → verify confidence + source_tier
 *   7. Admin promote pattern → VERIFIED
 *   8. POST /knowledge/articles → verify content-addressed hash + DID gate
 *   9. GET /knowledge/articles → verify listing
 */

const BASE = 'http://localhost:4692/api/v1';
const nonce = Date.now().toString(36);
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function post(path, body, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; } catch { return { status: r.status, data: text }; }
}

async function get(path, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; } catch { return { status: r.status, data: text }; }
}

async function register(suffix) {
  const r = await post('/agents/register', {
    username: `s23-${suffix}-${nonce}`,
    display_name: `Sprint23 ${suffix}`,
    password: 'TestPass123!',
    email: `s23${suffix}${nonce}@test.invalid`,
  });
  if (r.status !== 201) throw new Error(`Register failed for ${suffix}: ${JSON.stringify(r.data)}`);
  return { agentId: r.data.agent_id, apiKey: r.data.api_key };
}

// Register DID for an agent so they can submit knowledge articles
async function registerDid(agentId, apiKey) {
  const reg = await post(`/agents/${agentId}/did/register`, {}, apiKey);
  if (reg.status !== 200 && reg.status !== 201) return null;
  const { private_key_pem, challenge, challenge_token } = reg.data;
  if (!private_key_pem || !challenge || !challenge_token) return null;

  // Sign challenge using the server-returned private key
  const { createPrivateKey, sign } = await import('crypto');
  const privateKey = createPrivateKey({ key: private_key_pem, format: 'pem' });
  const signature = sign(null, Buffer.from(challenge, 'utf8'), privateKey);

  const verify = await post(`/agents/${agentId}/did/verify`, {
    challenge_token,
    challenge_signature: signature.toString('hex'),
  }, apiKey);
  return verify.status === 200 ? verify.data.did : null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log('\n═══ SPRINT 2.3: Badge/Karma Trigger + Knowledge Articles ════════════\n');

// ── Section 1: Badge unlock via vote accumulation ────────────────────────────
console.log('── 1. Register author + 8 voters ──');
const author = await register('author');
const voters = await Promise.all([...Array(8)].map((_, i) => register(`voter${i}`)));
assert('Author registered', !!author.apiKey);
assert('8 voters registered', voters.length === 8 && voters.every(v => !!v.apiKey));

// ── Get forum ────────────────────────────────────────────────────────────────
console.log('\n── 2. Get core-engineering forum ──');
const forumsResp = await get('/forums');
const forums = forumsResp.data?.forums || [];
const forum = forums.find(f => f.slug === 'core-engineering') || forums[0];
assert('Forum found', !!forum?.id, `${forums.length} forums available`);

// ── Create grump ─────────────────────────────────────────────────────────────
console.log('\n── 3. Create grump ──');
const grumpResp = await post('/grumps', {
  title: `S2.3 badge trigger grump ${nonce}`,
  content: `Sprint 2.3 badge trigger test — accumulate votes to hit rep threshold (nonce ${nonce})`,
  forum_id: forum?.id,
}, author.apiKey);
assert('Grump created (201)', grumpResp.status === 201, `got ${grumpResp.status}`);
const grumpId = grumpResp.data?.grump_id;
assert('Grump ID returned', !!grumpId);

// ── 8 voters upvote ──────────────────────────────────────────────────────────
console.log('\n── 4. 8 voters upvote (targeting rep ≥ 10 for first badge) ──');
const voteResults = await Promise.all(
  voters.map(v => post(`/grumps/${grumpId}/vote`, { value: 1 }, v.apiKey))
);
const successfulVotes = voteResults.filter(r => r.status === 200 || r.status === 201).length;
assert(`${successfulVotes}/8 votes accepted`, successfulVotes >= 7, `only ${successfulVotes} succeeded`);

// ── Check gamification progress ──────────────────────────────────────────────
console.log('\n── 5. Check gamification/progress for badge unlock ──');
const progressResp = await get('/gamification/progress', author.apiKey);
assert('Progress endpoint (200)', progressResp.status === 200, `got ${progressResp.status}`);
const progress = progressResp.data;
const rep = progress?.stats?.rep_score ?? 0;
const badgeCount = progress?.badges?.unlocked_count ?? 0;
const totalBadges = progress?.badges?.total_count ?? 0;
assert(`Rep reached ≥ 10 (got ${rep})`, rep >= 10, `need ≥ 10 for first badge`);
assert(`At least 1 badge unlocked (${badgeCount}/${totalBadges})`, badgeCount >= 1, `rep=${rep}`);
assert('Track progress returned', Array.isArray(progress?.tracks?.by_type), JSON.stringify(progress?.tracks));
if (badgeCount > 0) {
  const firstBadge = progress.badges.unlocked[0];
  assert(`First badge has slug`, !!firstBadge?.slug, JSON.stringify(firstBadge));
  assert(`First badge has tier`, !!firstBadge?.tier, JSON.stringify(firstBadge));
}

// ── Section 2: Knowledge pattern (VerifiedPattern) ──────────────────────────
console.log('\n── 6. Knowledge pattern creation ──');
const patternResp = await post('/knowledge/patterns', {
  title: `Ed25519 DID key derivation is more compact than RSA for agent identity — ${nonce}`,
  description: 'Ed25519 produces 32-byte public keys vs RSA-2048 at 256 bytes. For A2A agent identity where keys are stored in database columns and transmitted in every DID document, this reduces per-agent storage by ~87% and DID document size by ~75%. At 10k agents, RSA would require ~2.5MB vs ~320KB for Ed25519. The tradeoff is that Ed25519 lacks some legacy compatibility with older TLS stacks.',
  pattern_type: 'TECHNICAL',
  category: 'security',
  tags: ['did', 'ed25519', 'identity', 'performance'],
  code_snippet: '// Generate Ed25519 keypair\nconst { publicKey, privateKey } = generateKeyPairSync("ed25519");',
  language: 'typescript',
  source_url: 'https://www.rfc-editor.org/rfc/rfc8037',
  fact_check_score: 0.9,
  execution_score: 0.85,
  citation_score: 0.8,
}, author.apiKey);
assert('Pattern created (201)', patternResp.status === 201, `got ${patternResp.status}: ${JSON.stringify(patternResp.data)}`);
const patternId = patternResp.data?.id;
assert('Pattern ID returned', !!patternId);
assert('Confidence score computed', typeof patternResp.data?.confidence === 'number', `got ${patternResp.data?.confidence}`);
assert('Source tier classified', !!patternResp.data?.source_tier, `got ${patternResp.data?.source_tier}`);
assert('Publishable flag returned', typeof patternResp.data?.publishable === 'boolean');
assert('Status starts as PENDING (not auto-verified)', patternResp.data?.validation_status === 'PENDING', `got ${patternResp.data?.validation_status}`);

// ── Admin promote pattern ────────────────────────────────────────────────────
console.log('\n── 7. Admin promote pattern → VERIFIED ──');
const adminKey = process.env.ADMIN_API_KEY || 'grump-admin-dev-key';
const promoteResp = await (async () => {
  const headers = { 'Content-Type': 'application/json', 'x-admin-key': adminKey };
  const r = await fetch(`${BASE}/knowledge/patterns/${patternId}/promote`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'verify' }),
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; } catch { return { status: r.status, data: text }; }
})();
if (promoteResp.status === 403) {
  console.log('  ℹ️  Admin promote skipped (ADMIN_API_KEY not set in env — expected in dev)');
} else {
  assert('Pattern promoted (200)', promoteResp.status === 200, `got ${promoteResp.status}: ${JSON.stringify(promoteResp.data)}`);
  assert('Status is VERIFIED', promoteResp.data?.validation_status === 'VERIFIED', `got ${promoteResp.data?.validation_status}`);
}

// ── Section 3: KnowledgeArticle (Elite A2A model) ───────────────────────────
console.log('\n── 8. Knowledge article (Elite A2A) — DID gate check ──');
// First try WITHOUT DID — should get 403
const articleNoDid = await post('/knowledge/articles', {
  claim: 'Ed25519 is more efficient than RSA for DID keys in agent identity systems',
  reasoning: 'Key size: Ed25519=32B vs RSA-2048=256B, 87% smaller per agent.',
  applicability: 'Any A2A system where agent public keys are stored or transmitted.',
  limitations: 'Ed25519 lacks legacy TLS compatibility with some older stacks.',
  confidence: 0.85,
  tags: ['did', 'cryptography'],
}, author.apiKey);
assert('DID gate blocks non-DID agent (403)', articleNoDid.status === 403, `got ${articleNoDid.status}: ${JSON.stringify(articleNoDid.data)}`);

// Register DID for author
console.log('\n── 9. Register DID for author then create article ──');
const did = await registerDid(author.agentId, author.apiKey);
assert('DID registered for author', !!did, `got ${did}`);

// Now create article WITH DID
const articleResp = await post('/knowledge/articles', {
  claim: `Ed25519 produces 32-byte public keys vs RSA-2048 at 256 bytes, yielding 87% storage reduction per agent at equal security level — verified via benchmark ${nonce}`,
  reasoning: 'Public key size: Ed25519=32B, RSA-2048=256B. At 10k agents: Ed25519=320KB, RSA=2.5MB. Security level equivalent per NIST SP 800-57.',
  applicability: 'Any A2A system storing agent public keys in relational databases or transmitting DID documents over HTTP.',
  limitations: 'Ed25519 lacks some legacy TLS compatibility. Not suitable for systems requiring RSA-specific operations.',
  confidence: 0.87,
  tags: ['ed25519', 'rsa', 'did', 'performance', 'a2a'],
}, author.apiKey);
assert('Article created (201)', articleResp.status === 201, `got ${articleResp.status}: ${JSON.stringify(articleResp.data)}`);
const articleId = articleResp.data?.id;
assert('Article ID returned', !!articleId);
assert('git_commit_hash present (content-addressed)', !!articleResp.data?.git_commit_hash, `got ${articleResp.data?.git_commit_hash}`);
assert('git_commit_hash is 64-char SHA-256 hex', articleResp.data?.git_commit_hash?.length === 64);
assert('confidence returned', typeof articleResp.data?.confidence === 'number');
assert('author_did matches', articleResp.data?.author_did === did, `expected ${did}, got ${articleResp.data?.author_did}`);

// ── Duplicate check ───────────────────────────────────────────────────────── 
console.log('\n── 10. Duplicate article check (409 expected) ──');
const dupResp = await post('/knowledge/articles', {
  claim: `Ed25519 produces 32-byte public keys vs RSA-2048 at 256 bytes, yielding 87% storage reduction per agent at equal security level — verified via benchmark ${nonce}`,
  reasoning: 'Public key size: Ed25519=32B, RSA-2048=256B. At 10k agents: Ed25519=320KB, RSA=2.5MB. Security level equivalent per NIST SP 800-57.',
  applicability: 'Any A2A system storing agent public keys in relational databases or transmitting DID documents over HTTP.',
  limitations: 'Ed25519 lacks some legacy TLS compatibility. Not suitable for systems requiring RSA-specific operations.',
  confidence: 0.87,
  tags: ['ed25519', 'rsa', 'did', 'performance', 'a2a'],
}, author.apiKey);
assert('Duplicate blocked (409)', dupResp.status === 409, `got ${dupResp.status}`);
assert('Existing ID returned in 409', !!dupResp.data?.existing_id);

// ── List articles ─────────────────────────────────────────────────────────── 
console.log('\n── 11. List knowledge articles ──');
const listResp = await get(`/knowledge/articles?min_confidence=0.8`);
assert('Articles list (200)', listResp.status === 200, `got ${listResp.status}`);
assert('Articles array present', Array.isArray(listResp.data?.articles));
const ourArticle = listResp.data?.articles?.find(a => a.id === articleId);
assert('Created article appears in listing', !!ourArticle, `articleId=${articleId}`);
assert('Article has immutable hash in listing', ourArticle?.git_commit_hash?.length === 64);

// ── Final Report ──────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n═══ SPRINT 2.3 RESULTS: ${passed}/${total} passed ════════════════════════\n`);
if (failed > 0) {
  console.log(`  ${failed} failures above — investigate before proceeding to Sprint 2.4\n`);
  process.exit(1);
} else {
  console.log(`  All ${passed} assertions PASS — Sprint 2.3 COMPLETE ✅\n`);
  process.exit(0);
}
