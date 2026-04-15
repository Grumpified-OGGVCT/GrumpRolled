import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

loadPreferredPostgresEnv();

const args = process.argv.slice(2);
const BASE = (args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:4692').replace(/\/$/, '');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures: Array<{ label: string; detail?: string }> = [];

function assert(label: string, condition: boolean, detail = '') {
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
  console.log(`Runtime track progression: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`  ${FAIL} ${failure.label}${failure.detail ? ` — ${failure.detail}` : ''}`);
    }
  }
  console.log('─'.repeat(60));
  process.exitCode = failed > 0 ? 1 : 0;
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { status: response.status, json };
}

function uniqueUsername(prefix: string) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${nonce}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
}

async function register(prefix: string, preferredName: string) {
  const username = uniqueUsername(prefix);
  const response = await api('POST', '/api/v1/agents/register', { username, preferredName });

  if (response.status !== 201 || !response.json?.api_key) {
    throw new Error(`register failed (${response.status}): ${JSON.stringify(response.json)}`);
  }

  return {
    id: response.json.agent_id as string,
    username: response.json.username as string,
    token: response.json.api_key as string,
  };
}

async function main() {
  const [{ db }, { reconcileAgentReputation }] = await Promise.all([
    import('../src/lib/db'),
    import('../src/lib/auth'),
  ]);

  console.log(`\n🧪  Runtime Track Progression Validation (${BASE})\n`);

  const availability = await api('GET', '/api/v1/forums');
  assert('GET /api/v1/forums → 200', availability.status === 200, `got ${availability.status}`);
  if (availability.status !== 200) {
    finish();
    return;
  }

  console.log('\n1. Provisioning target and helper agents...');
  const [target, helper] = await Promise.all([
    register('track-target', 'Track Target'),
    register('track-helper', 'Track Helper'),
  ]);
  assert('registered target agent', !!target.id, target.username);
  assert('registered helper agent', !!helper.id, helper.username);

  console.log('\n2. Seeding authored patterns and validations across real thresholds...');
  const authoredPatterns = await Promise.all(
    Array.from({ length: 15 }, (_, index) =>
      db.verifiedPattern.create({
        data: {
          authorId: target.id,
          title: `Track proof authored pattern ${index + 1} ${target.username}`,
          description: `Authored pattern ${index + 1} for seeded track-threshold proof on ${target.username}.`,
          patternType: 'BEST_PRACTICE',
          validationStatus: 'VERIFIED',
          confidence: 0.9,
          tags: JSON.stringify(['runtime', 'track-proof']),
          category: 'coding',
          publishedAt: new Date(),
        },
      })
    )
  );
  assert('created 15 authored patterns', authoredPatterns.length === 15, `got ${authoredPatterns.length}`);

  const helperPatterns = await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      db.verifiedPattern.create({
        data: {
          authorId: helper.id,
          title: `Track proof helper pattern ${index + 1} ${target.username}`,
          description: `Helper-authored pattern ${index + 1} that the target validates during runtime proof.`,
          patternType: 'WORKFLOW',
          validationStatus: 'VERIFIED',
          confidence: 0.88,
          tags: JSON.stringify(['runtime', 'track-proof', 'validation-target']),
          category: 'agents',
          publishedAt: new Date(),
        },
      })
    )
  );
  assert('created 40 helper patterns', helperPatterns.length === 40, `got ${helperPatterns.length}`);

  const validations = await Promise.all(
    helperPatterns.map((pattern, index) =>
      db.patternValidation.create({
        data: {
          patternId: pattern.id,
          validatorId: target.id,
          workedAsExpected: true,
          rating: 5,
          feedback: `Runtime track proof validation ${index + 1}`,
        },
      })
    )
  );
  assert('created 40 validations', validations.length === 40, `got ${validations.length}`);

  console.log('\n3. Seeding contribution rewards and reconciling canonical rep...');
  await db.knowledgeContribution.createMany({
    data: [
      ...authoredPatterns.map((pattern) => ({
        agentId: target.id,
        contributionType: 'PATTERN',
        referenceId: pattern.id,
        repEarned: 10,
        qualityScore: 0.9,
      })),
      ...validations.map((validation) => ({
        agentId: target.id,
        contributionType: 'VALIDATION',
        referenceId: validation.id,
        repEarned: 5,
        qualityScore: 0.95,
      })),
      {
        agentId: target.id,
        contributionType: 'ANSWER',
        referenceId: `fixture-answer-${target.id}`,
        repEarned: 50,
        qualityScore: 1,
      },
    ],
  });

  const reconciledRep = await reconcileAgentReputation(target.id);
  assert('canonical reputation reconciled to 400', reconciledRep === 400, `got ${reconciledRep}`);

  console.log('\n4. Verifying private and public progression surfaces...');
  const me = await api('GET', '/api/v1/agents/me', undefined, target.token);
  assert('GET /api/v1/agents/me → 200', me.status === 200, `got ${me.status}: ${JSON.stringify(me.json)}`);
  assert('private progression rep score is 400', me.json?.progression?.stats?.rep_score === 400, `got ${me.json?.progression?.stats?.rep_score}`);

  const byType = new Map((me.json?.progression?.tracks?.by_type ?? []).map((track: any) => [track.track_type, track]));
  assert('coding current track is coding-journeyman', byType.get('CODING')?.current?.slug === 'coding-journeyman', JSON.stringify(byType.get('CODING')));
  assert('reasoning current track is reasoning-specialist', byType.get('REASONING')?.current?.slug === 'reasoning-specialist', JSON.stringify(byType.get('REASONING')));
  assert('execution current track is execution-master', byType.get('EXECUTION')?.current?.slug === 'execution-master', JSON.stringify(byType.get('EXECUTION')));

  const publicProfile = await api('GET', `/api/v1/agents/by-username/${encodeURIComponent(target.username)}`);
  assert('GET /api/v1/agents/by-username/:username → 200', publicProfile.status === 200, `got ${publicProfile.status}: ${JSON.stringify(publicProfile.json)}`);
  assert('public profile exposes coding-journeyman', publicProfile.json?.current_tracks?.some((track: any) => track.slug === 'coding-journeyman') === true, JSON.stringify(publicProfile.json?.current_tracks));
  assert('public profile exposes reasoning-specialist', publicProfile.json?.current_tracks?.some((track: any) => track.slug === 'reasoning-specialist') === true, JSON.stringify(publicProfile.json?.current_tracks));
  assert('public profile exposes execution-master', publicProfile.json?.current_tracks?.some((track: any) => track.slug === 'execution-master') === true, JSON.stringify(publicProfile.json?.current_tracks));

  const publicPage = await fetch(`${BASE}/agents/${encodeURIComponent(target.username)}`);
  const publicHtml = await publicPage.text();
  assert('GET /agents/:username → 200', publicPage.status === 200, `got ${publicPage.status}`);
  assert('public page renders unlocked track slug', publicHtml.includes('coding-journeyman') || publicHtml.includes('execution-master'), 'expected unlocked track marker in HTML');

  const persistedUpgrades = await db.agentUpgrade.findMany({ where: { agentId: target.id }, orderBy: { trackSlug: 'asc' } });
  assert('persisted upgrades created for unlocked tracks', persistedUpgrades.length >= 3, `got ${persistedUpgrades.length}`);

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime track progression crashed: ${error.message}`);
  failures.push({ label: 'runtime track progression crashed', detail: error.message });
  failed += 1;
  finish();
});