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
  console.log(`Runtime skills loop: ${passed} passed, ${failed} failed`);
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

async function main() {
  console.log(`\n🧪  Runtime Skills Loop Validation (${BASE})\n`);

  const author = await register('skill-author', 'Runtime Skill Author');
  const installer = await register('skill-installer', 'Runtime Skill Installer');
  assert('registered skill author agent', Boolean(author.id), author.username);
  assert('registered skill installer agent', Boolean(installer.id), installer.username);

  const created = await api('POST', '/api/v1/skills', {
    token: author.token,
    body: {
      name: `Runtime Skill ${Math.random().toString(36).slice(2, 8)}`,
      description: 'Runtime-created skill used to prove the publish/install/profile loop.',
      category: 'AUTOMATION',
      install_type: 'PROMPT_TEMPLATE',
      install_data: {
        prompt: 'Use this runtime skill carefully.',
        mode: 'runtime-proof',
      },
    },
  });
  assert('POST /api/v1/skills → 201', created.status === 201, `got ${created.status}: ${JSON.stringify(created.json)}`);
  const skillId = created.json?.id;
  const skillSlug = created.json?.slug;
  assert('created skill id returned', Boolean(skillId), JSON.stringify(created.json));
  assert('created skill slug returned', Boolean(skillSlug), JSON.stringify(created.json));
  if (!skillId) {
    finish();
    return;
  }

  const list = await api('GET', `/api/v1/skills?q=${encodeURIComponent(created.json.name)}&limit=10`, { token: installer.token });
  assert('GET /api/v1/skills → 200', list.status === 200, `got ${list.status}: ${JSON.stringify(list.json)}`);
  const listedSkill = list.json?.skills?.find((item) => item.id === skillId);
  assert('skills registry returns the published skill', Boolean(listedSkill), JSON.stringify(list.json?.skills));
  assert('published skill is not installed for installer before install', listedSkill?.installed_by_viewer === false, JSON.stringify(listedSkill));

  const install = await api('POST', `/api/v1/skills/${skillId}/install`, { token: installer.token });
  assert('POST /api/v1/skills/[id]/install → 201', install.status === 201, `got ${install.status}: ${JSON.stringify(install.json)}`);
  assert('install response marks installed true', install.json?.installed === true, JSON.stringify(install.json));

  const meAuthor = await api('GET', '/api/v1/agents/me', { token: author.token });
  assert('GET /api/v1/agents/me for author → 200', meAuthor.status === 200, `got ${meAuthor.status}: ${JSON.stringify(meAuthor.json)}`);
  assert('author profile exposes published skill', Array.isArray(meAuthor.json?.published_skills) && meAuthor.json.published_skills.some((skill) => skill.id === skillId), JSON.stringify(meAuthor.json?.published_skills));
  assert('author profile exposes capability summary', Boolean(meAuthor.json?.capability_summary?.canonical_level_summary), JSON.stringify(meAuthor.json?.capability_summary));

  const meInstaller = await api('GET', '/api/v1/agents/me', { token: installer.token });
  assert('GET /api/v1/agents/me for installer → 200', meInstaller.status === 200, `got ${meInstaller.status}: ${JSON.stringify(meInstaller.json)}`);
  assert('installer profile exposes installed skill', Array.isArray(meInstaller.json?.installed_skills) && meInstaller.json.installed_skills.some((skill) => skill.id === skillId), JSON.stringify(meInstaller.json?.installed_skills));
  assert('installer profile exposes capability summary', Boolean(meInstaller.json?.capability_summary?.canonical_level_summary), JSON.stringify(meInstaller.json?.capability_summary));

  const publicProfile = await api('GET', `/api/v1/agents/by-username/${encodeURIComponent(author.username)}`);
  assert('GET /api/v1/agents/by-username/:username → 200', publicProfile.status === 200, `got ${publicProfile.status}: ${JSON.stringify(publicProfile.json)}`);
  assert('public profile exposes published skills', Array.isArray(publicProfile.json?.published_skills) && publicProfile.json.published_skills.some((skill) => skill.id === skillId), JSON.stringify(publicProfile.json?.published_skills));

  const skillsPage = await fetch(`${BASE}/skills`);
  const skillsHtml = await skillsPage.text();
  assert('GET /skills page → 200', skillsPage.status === 200, `got ${skillsPage.status}`);
  assert('skills page renders browsing surface', skillsHtml.includes('Browse Skills'));
  assert('skills page renders publishing surface', skillsHtml.includes('Publish Skill'));

  const publicProfilePage = await fetch(`${BASE}/agents/${encodeURIComponent(author.username)}`);
  const publicProfileHtml = await publicProfilePage.text();
  assert('GET /agents/[username] page → 200', publicProfilePage.status === 200, `got ${publicProfilePage.status}`);
  assert('public profile page renders skills section', publicProfileHtml.includes('Published Skills'));

  finish();
}

main().catch((error) => {
  console.error(`\n${FAIL} runtime skills loop crashed: ${error.message}`);
  failures.push({ label: 'runtime skills loop crashed', detail: error.message });
  failed += 1;
  finish();
});