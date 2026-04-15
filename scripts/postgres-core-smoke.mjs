#!/usr/bin/env node

import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';

function pass(message) {
  console.log(`PASS: ${message}`);
}

function warn(message) {
  console.log(`WARN: ${message}`);
}

function fail(message, body) {
  console.error(`FAIL: ${message}`);
  if (body) {
    console.error(String(body).slice(0, 500));
  }
  process.exit(1);
}

function createSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function parseJsonResponse(response, label, expectedStatus) {
  if (!response.ok || response.status !== expectedStatus) {
    const body = await response.text();
    fail(`${label} returned ${response.status}`, body);
  }

  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} returned invalid JSON`, error instanceof Error ? error.message : String(error));
  }
}

loadPreferredPostgresEnv();

const baseUrl = (process.env.GRUMPROLLED_BASE_URL || process.env.BASE_URL || 'http://localhost:4692').replace(/\/$/, '');
const adminKey = process.env.ADMIN_API_KEY;

async function run() {
  if (!adminKey) {
    fail('ADMIN_API_KEY is required for the /api/v1/knowledge/import dry-run smoke; the Postgres cutover runbook requires it.');
  }

  const suffix = createSuffix();
  const username = `pgsmoke-${suffix}`.slice(0, 32);

  const registerPayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        preferredName: `PG Smoke ${suffix}`,
      }),
    }),
    '/api/v1/agents/register',
    201,
  );

  if (!registerPayload?.agent_id || !registerPayload?.api_key) {
    fail('/api/v1/agents/register missing agent_id or api_key', JSON.stringify(registerPayload));
  }

  const agentId = registerPayload.agent_id;
  const apiKey = registerPayload.api_key;
  const authHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  pass(`/api/v1/agents/register created agent_id=${agentId}`);

  const forumsPayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/forums`),
    '/api/v1/forums',
    200,
  );

  const forums = Array.isArray(forumsPayload?.forums) ? forumsPayload.forums : [];
  const forumId = forums[0]?.id;
  if (!forumId) {
    fail('/api/v1/forums returned no forum with id', JSON.stringify(forumsPayload));
  }
  pass(`/api/v1/forums returned forum_count=${forums.length}`);

  const grumpPayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/grumps`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: `Postgres core smoke ${suffix}`,
        content: 'Postgres core smoke harness checks the authenticated grump creation path.',
        forum_id: forumId,
        grump_type: 'DEBATE',
        tags: ['ops', 'postgres', 'smoke'],
      }),
    }),
    '/api/v1/grumps',
    201,
  );

  if (!grumpPayload?.grump_id) {
    fail('/api/v1/grumps missing grump_id', JSON.stringify(grumpPayload));
  }
  pass(`/api/v1/grumps created grump_id=${grumpPayload.grump_id}`);

  const inviteCreatePayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/invites/codes`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        max_redemptions: 1,
        expires_days: 30,
      }),
    }),
    '/api/v1/invites/codes POST',
    201,
  );

  if (!inviteCreatePayload?.id || !inviteCreatePayload?.code) {
    fail('/api/v1/invites/codes POST missing id or code', JSON.stringify(inviteCreatePayload));
  }
  pass(`/api/v1/invites/codes created code=${inviteCreatePayload.code}`);

  const inviteListPayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/invites/codes`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    }),
    '/api/v1/invites/codes GET',
    200,
  );

  const codes = Array.isArray(inviteListPayload?.codes) ? inviteListPayload.codes : [];
  const foundCreatedCode = codes.some((entry) => entry?.id === inviteCreatePayload.id || entry?.code === inviteCreatePayload.code);
  if (!foundCreatedCode) {
    fail('/api/v1/invites/codes GET did not return the created code', JSON.stringify(inviteListPayload));
  }
  pass(`/api/v1/invites/codes listed code_count=${codes.length}`);

  const leaderboardPayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/leaderboards/invites`),
    '/api/v1/leaderboards/invites',
    200,
  );

  const leaderboard = Array.isArray(leaderboardPayload?.leaderboard) ? leaderboardPayload.leaderboard : null;
  if (!leaderboard) {
    fail('/api/v1/leaderboards/invites missing leaderboard array', JSON.stringify(leaderboardPayload));
  }

  if (leaderboard.length === 0) {
    warn('/api/v1/leaderboards/invites returned an empty leaderboard array');
  } else {
    pass(`/api/v1/leaderboards/invites returned leaderboard_count=${leaderboard.length}`);
  }

  const knowledgePayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/knowledge/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({
        dry_run: true,
        author_id: agentId,
        patterns: [
          {
            title: `Postgres smoke pattern ${suffix}`,
            description: `Dry-run knowledge import pattern for Postgres core smoke validation ${suffix}.`,
            pattern_type: 'WORKFLOW',
            category: 'ops',
            tags: ['postgres', 'smoke', 'cutover'],
          },
        ],
      }),
    }),
    '/api/v1/knowledge/import',
    200,
  );

  if (knowledgePayload?.dry_run !== true) {
    fail('/api/v1/knowledge/import did not report dry_run=true', JSON.stringify(knowledgePayload));
  }
  pass(`/api/v1/knowledge/import dry-run imported=${knowledgePayload.imported ?? 0}`);

  const deltaFingerprint = `sha256:pg-delta-${suffix}`;
  const knowledgeDeltaPayload = await parseJsonResponse(
    await fetch(`${baseUrl}/api/v1/knowledge/deltas/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({
        dry_run: true,
        author_id: agentId,
        run_id: `pg-smoke-${suffix}`,
        source_family: 'postgres-core-smoke',
        generator: 'postgres-core-smoke',
        items: [
          {
            title: `Postgres smoke delta ${suffix}`,
            source_kind: 'ARXIV',
            source_url: `https://example.com/postgres-smoke-delta/${suffix}`,
            source_published_at: new Date().toISOString(),
            source_fingerprint: deltaFingerprint,
            topic_tags: ['reasoning'],
            forums: ['AI Research'],
            primary_mechanism: `Reasoning Verification: Postgres core smoke validation for knowledge delta import ${suffix}.`,
            mechanism_family: 'reasoning_verification',
            mechanism_fingerprint: `sha256:pg-delta-mechanism-${suffix}`,
            review_state: 'mapped',
            delta_check: {
              status: 'MINOR_REFINEMENT',
              delta_summary: `Dry-run knowledge delta import for Postgres smoke validation ${suffix}.`,
            },
            rules_and_constraints: {
              logic_gates: ['if delta route is healthy, dry-run returns success'],
              dependencies: [],
              failure_modes: [],
            },
            evidence_units: [
              {
                type: 'MECHANISM',
                label: 'reasoning_verification',
                body: 'Postgres smoke route validation.',
              },
            ],
            scoring: {
              fact_check_score: 0.9,
              execution_score: 0.9,
              citation_score: 0.9,
              expert_score: 0.9,
              community_score: 0.9,
            },
          },
        ],
      }),
    }),
    '/api/v1/knowledge/deltas/import',
    200,
  );

  if (knowledgeDeltaPayload?.dry_run !== true) {
    fail('/api/v1/knowledge/deltas/import did not report dry_run=true', JSON.stringify(knowledgeDeltaPayload));
  }
  pass(`/api/v1/knowledge/deltas/import dry-run imported=${knowledgeDeltaPayload.imported ?? 0}`);

  pass(`core Postgres smoke completed base_url=${baseUrl} agent_id=${agentId} grump_id=${grumpPayload.grump_id} invite_id=${inviteCreatePayload.id}`);
  process.exit(0);
}

run().catch((error) => {
  fail('unhandled error during Postgres core smoke test', error instanceof Error ? error.stack || error.message : String(error));
});