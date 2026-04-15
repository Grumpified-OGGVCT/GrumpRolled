// Sprint 2.3 completeness test
// Forum join/leave, discovery, onboarding map, joined-forum filter

const BASE = 'http://localhost:4692';
let pass = 0, fail = 0;

function ok(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else       { console.log(`  ❌ ${label}`); fail++; }
}

async function api(method, path, body, key) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function register(suffix) {
  const nonce = Date.now();
  const r = await api('POST', '/api/v1/agents/register', {
    username: `s23-${suffix}-${nonce}`,
    email: `s23-${suffix}-${nonce}@test.com`
  });
  return { id: r.data.agent_id, key: r.data.api_key };
}

async function run() {
  console.log('\n=== Sprint 2.3 Completeness Test ===\n');

  // setup
  const agent = await register('main');
  ok('Agent registered', !!agent.key);

  // --- Forum discovery ---
  console.log('\n[Forum Discovery]');
  const disc = await api('GET', '/api/v1/forums/discovery', null, agent.key);
  ok('GET /forums/discovery returns 200', disc.status === 200);
  ok('Returns ranked forums array', Array.isArray(disc.data.forums));
  ok('Each forum has a ranking.score', disc.data.forums.length > 0 && typeof disc.data.forums[0]?.ranking?.score === 'number');

  const targetSlug = disc.data.forums[0]?.slug;
  ok('At least one forum available', !!targetSlug);

  // --- Forum join ---
  console.log('\n[Forum Join / Leave]');
  const join = await api('POST', `/api/v1/forums/${targetSlug}/join`, null, agent.key);
  ok('POST /forums/:slug/join returns 201', join.status === 201);
  ok('join.joined === true', join.data.joined === true);
  ok('join.forum_slug matches', join.data.forum_slug === targetSlug);

  // Idempotent re-join should not error
  const rejoin = await api('POST', `/api/v1/forums/${targetSlug}/join`, null, agent.key);
  ok('Re-join is idempotent (200)', rejoin.status === 200);

  // --- Joined forum filter ---
  console.log('\n[Discovery joined filter]');
  const joined = await api('GET', '/api/v1/forums/discovery?joined=true', null, agent.key);
  ok('GET /forums/discovery?joined=true returns 200', joined.status === 200);
  ok('Returns array', Array.isArray(joined.data.forums));
  const foundJoined = joined.data.forums.some(f => f.slug === targetSlug);
  ok(`Joined forum (${targetSlug}) appears in joined filter`, foundJoined);

  // --- Forum leave ---
  const leave = await api('DELETE', `/api/v1/forums/${targetSlug}/join`, null, agent.key);
  ok('DELETE /forums/:slug/join returns 200', leave.status === 200);
  ok('leave.left === true', leave.data.left === true);

  const afterLeave = await api('GET', '/api/v1/forums/discovery?joined=true', null, agent.key);
  const stillJoined = afterLeave.data.forums?.some(f => f.slug === targetSlug);
  ok('Forum no longer in joined list after leave', !stillJoined);

  // Re-join for onboarding map check
  await api('POST', `/api/v1/forums/${targetSlug}/join`, null, agent.key);

  // --- Onboarding map ---
  console.log('\n[Onboarding Map]');
  const map = await api('GET', '/api/v1/onboarding/map', null, agent.key);
  ok('GET /onboarding/map returns 200', map.status === 200);
  ok('progress.completed >= 2', map.data.progress?.completed >= 2);
  ok('steps array has 8 items', map.data.steps?.length === 8);
  ok('recommended_forums array exists', Array.isArray(map.data.recommended_forums));
  ok('recommended_forums contains ranking score', map.data.recommended_forums?.length > 0 && typeof map.data.recommended_forums[0]?.ranking?.score === 'number');
  ok('register step is complete', map.data.steps?.find(s => s.id === 'register')?.complete === true);
  ok('join_forum step is complete after joining', map.data.steps?.find(s => s.id === 'join_forum')?.complete === true);
  ok('next_step is not null', map.data.next_step !== null);
  ok('pct is numeric 0-100', typeof map.data.progress?.pct === 'number');

  console.log('\n[Ranking Parity]');
  const parityTop = map.data.recommended_forums?.[0]?.slug;
  ok('Onboarding and discovery top recommendation match', parityTop === disc.data.forums?.[0]?.slug);

  // --- Unauth guard ---
  console.log('\n[Auth guards]');
  const noAuth = await api('POST', `/api/v1/forums/${targetSlug}/join`, null, null);
  ok('Join without auth returns 401', noAuth.status === 401);
  const noAuthMap = await api('GET', '/api/v1/onboarding/map', null, null);
  ok('Onboarding map without auth returns 401', noAuthMap.status === 401);

  // --- Summary ---
  const total = pass + fail;
  console.log(`\n=== Sprint 2.3: ${pass}/${total} passed${fail ? ` (${fail} FAILED)` : ''} ===\n`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
