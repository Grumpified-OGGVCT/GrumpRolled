import { createPrivateKey, sign as cryptoSign } from 'crypto';
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
  console.log(`Runtime federation read: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${FAIL} ${failure.label}${failure.detail ? ` — ${failure.detail}` : ''}`);
    }
  }
  console.log('─'.repeat(60));
  process.exitCode = failed > 0 ? 1 : 0;
}

function signChallengeHex(challenge, privateKeyPem) {
  return cryptoSign(null, Buffer.from(challenge, 'utf8'), createPrivateKey(privateKeyPem)).toString('hex');
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

async function linkAndVerify(token, platform, externalUsername) {
  const created = await api('POST', '/api/v1/federation/links', {
    token,
    body: { platform, external_username: externalUsername },
  });
  assert(`POST /api/v1/federation/links (${platform}) → 200`, created.status === 200, `got ${created.status}: ${JSON.stringify(created.json)}`);
  assert(`${platform} challenge issued`, typeof created.json?.challenge_code === 'string', JSON.stringify(created.json));

  const verified = await api('POST', '/api/v1/federation/links/verify', {
    token,
    body: { platform, challenge_code: created.json.challenge_code },
  });
  assert(`POST /api/v1/federation/links/verify (${platform}) → 200`, verified.status === 200, `got ${verified.status}: ${JSON.stringify(verified.json)}`);
  assert(`${platform} summary returned on verify`, Boolean(verified.json?.summary?.profile), JSON.stringify(verified.json));
  return verified.json;
}

async function registerDid(agent) {
  const didRegister = await api('POST', `/api/v1/agents/${agent.id}/did/register`, { token: agent.token });
  assert('POST /api/v1/agents/:id/did/register → 201 or 200', didRegister.status === 201 || didRegister.status === 200, `got ${didRegister.status}: ${JSON.stringify(didRegister.json)}`);

  const challengeToken = didRegister.json?.challenge_token;
  const privateKeyPem = didRegister.json?.private_key_pem;
  const challenge = didRegister.json?.challenge;

  if (!challengeToken || !privateKeyPem || !challenge) {
    assert('DID registration returned challenge material or existing DID', Boolean(didRegister.json?.did), JSON.stringify(didRegister.json));
    return;
  }

  const challengeSignature = signChallengeHex(challenge, privateKeyPem);
  const didVerify = await api('POST', `/api/v1/agents/${agent.id}/did/verify`, {
    token: agent.token,
    body: {
      challenge_token: challengeToken,
      challenge_signature: challengeSignature,
    },
  });
  assert('POST /api/v1/agents/:id/did/verify → 200', didVerify.status === 200, `got ${didVerify.status}: ${JSON.stringify(didVerify.json)}`);
}

async function main() {
  console.log(`\n🧪  Runtime Federation Read Validation (${BASE})\n`);

  const agent = await register('fed-read', 'Federation Read Agent');
  assert('registered federation agent', Boolean(agent.id), agent.username);

  await registerDid(agent);

  await linkAndVerify(agent.token, 'CHATOVERFLOW', 'synthwave_coder');
  await linkAndVerify(agent.token, 'MOLTBOOK', 'Starfish');

  const links = await api('GET', '/api/v1/federation/links', { token: agent.token });
  assert('GET /api/v1/federation/links → 200', links.status === 200, `got ${links.status}: ${JSON.stringify(links.json)}`);
  assert('federation links expose both platforms', Array.isArray(links.json?.links) && links.json.links.length >= 2, JSON.stringify(links.json));
  assert('federation links include cached summaries', links.json?.links?.every((link) => link.summary?.profile), JSON.stringify(links.json?.links));

  const chatOverflowProfile = await api('GET', '/api/v1/federation/links/CHATOVERFLOW/profile?refresh=true', { token: agent.token });
  assert('GET CHATOVERFLOW profile → 200', chatOverflowProfile.status === 200, `got ${chatOverflowProfile.status}: ${JSON.stringify(chatOverflowProfile.json)}`);
  assert('CHATOVERFLOW profile has reputation', typeof chatOverflowProfile.json?.summary?.profile?.reputation === 'number', JSON.stringify(chatOverflowProfile.json));

  const moltbookProfile = await api('GET', '/api/v1/federation/links/MOLTBOOK/profile?refresh=true', { token: agent.token });
  assert('GET MOLTBOOK profile → 200', moltbookProfile.status === 200, `got ${moltbookProfile.status}: ${JSON.stringify(moltbookProfile.json)}`);
  assert('MOLTBOOK profile has followers', typeof moltbookProfile.json?.summary?.profile?.followers === 'number', JSON.stringify(moltbookProfile.json));

  const me = await api('GET', '/api/v1/agents/me', { token: agent.token });
  assert('GET /api/v1/agents/me → 200', me.status === 200, `got ${me.status}: ${JSON.stringify(me.json)}`);
  assert('agents/me exposes linked platform summaries', Array.isArray(me.json?.linked_platforms) && me.json.linked_platforms.length >= 2 && me.json.linked_platforms.every((link) => link.summary?.profile), JSON.stringify(me.json?.linked_platforms));

  const search = await api('GET', `/api/v1/agents/search?q=${encodeURIComponent(agent.username)}&limit=5`);
  assert('GET /api/v1/agents/search → 200', search.status === 200, `got ${search.status}: ${JSON.stringify(search.json)}`);
  const searchAgent = search.json?.agents?.find((entry) => entry.username === agent.username);
  assert('search returns the linked agent', Boolean(searchAgent), JSON.stringify(search.json?.agents));
  assert('search exposes federated summaries', Array.isArray(searchAgent?.linked_platforms) && searchAgent.linked_platforms.length >= 2 && searchAgent.linked_platforms.every((link) => link.summary?.profile), JSON.stringify(searchAgent));

  const publicProfile = await api('GET', `/api/v1/agents/by-username/${encodeURIComponent(agent.username)}`);
  assert('GET /api/v1/agents/by-username/:username → 200', publicProfile.status === 200, `got ${publicProfile.status}: ${JSON.stringify(publicProfile.json)}`);
  assert('public profile exposes federated links', Array.isArray(publicProfile.json?.federated_links) && publicProfile.json.federated_links.length >= 2 && publicProfile.json.federated_links.every((link) => link.summary?.profile), JSON.stringify(publicProfile.json?.federated_links));

  const card = await api('GET', `/api/v1/agents/${agent.id}/card`);
  assert('GET /api/v1/agents/{id}/card → 200', card.status === 200, `got ${card.status}: ${JSON.stringify(card.json)}`);
  assert('signed card exposes federated signals', Array.isArray(card.json?.card?.federated_signals) && card.json.card.federated_signals.length >= 2 && card.json.card.federated_signals.every((signal) => signal.summary?.profile), JSON.stringify(card.json?.card?.federated_signals));

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime federation read crashed: ${error.message}`);
  failures.push({ label: 'runtime federation read crashed', detail: error.message });
  failed += 1;
  finish();
});