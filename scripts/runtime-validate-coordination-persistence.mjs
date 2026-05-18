import { PrismaClient } from '@prisma/client';

import { loadPreferredPostgresEnv } from './lib/load-postgres-env.mjs';
import { createRuntimeRunId, uniqueRuntimeUsername } from './lib/runtime-validation-harness.mjs';

loadPreferredPostgresEnv();

const BASE = (
  process.argv.includes('--base')
    ? process.argv[process.argv.indexOf('--base') + 1]
    : process.env.GRUMPROLLED_BASE_URL || process.env.GRUMPROLLED_API_BASE || 'http://127.0.0.1:4692'
).replace(/\/$/, '');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];
const runId = createRuntimeRunId('coordination');
const prisma = new PrismaClient({
  log: process.env.DB_QUERY_LOG === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

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

async function finish() {
  await prisma.$disconnect().catch(() => {});
  console.log('\n' + '─'.repeat(60));
  console.log(`Runtime coordination persistence: ${passed} passed, ${failed} failed`);
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
  return uniqueRuntimeUsername(prefix, `${runId}-${Math.random().toString(36).slice(2, 6)}`);
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

async function queryMessageRow(id) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "id", "fromAgent", "toAgents", "idempotencyKey", "processedAt" FROM "CoordinationMessage" WHERE "id" = $1 LIMIT 1',
    id,
  );
  return rows[0] || null;
}

async function main() {
  console.log(`\n🧪  Runtime Coordination Persistence Validation (${BASE})\n`);

  const sender = await register('coord-sender', 'Coordination Sender');
  const recipient = await register('coord-recipient', 'Coordination Recipient');
  assert('registered sender agent', Boolean(sender.token), sender.username);
  assert('registered recipient agent', Boolean(recipient.token), recipient.username);

  const idempotencyKey = `coord-proof-${runId}`;
  const payload = {
    body: {
      task: 'persisted coordination proof',
      run_id: runId,
    },
  };

  const created = await api('POST', '/api/v1/ops/coordination', {
    token: sender.token,
    body: {
      action: 'coordinate',
      toAgents: [recipient.username],
      payload,
      idempotencyKey,
    },
  });
  assert('POST /api/v1/ops/coordination → 201', created.status === 201, `got ${created.status}: ${JSON.stringify(created.json)}`);
  const messageId = created.json?.message?.id;
  assert('coordination message id returned', Boolean(messageId), JSON.stringify(created.json));
  if (!messageId) {
    await finish();
    return;
  }

  const duplicated = await api('POST', '/api/v1/ops/coordination', {
    token: sender.token,
    body: {
      action: 'coordinate',
      toAgents: [recipient.username],
      payload,
      idempotencyKey,
    },
  });
  assert('duplicate POST returns 200', duplicated.status === 200, `got ${duplicated.status}: ${JSON.stringify(duplicated.json)}`);
  assert('duplicate POST flagged duplicate=true', duplicated.json?.duplicate === true, JSON.stringify(duplicated.json));
  assert('duplicate POST returns same message id', duplicated.json?.message?.id === messageId, JSON.stringify(duplicated.json));

  const recipientInbox = await api('GET', '/api/v1/ops/coordination?limit=20', { token: recipient.token });
  assert('recipient GET /api/v1/ops/coordination → 200', recipientInbox.status === 200, `got ${recipientInbox.status}: ${JSON.stringify(recipientInbox.json)}`);
  const visibleMessage = recipientInbox.json?.messages?.find((message) => message.id === messageId);
  assert('recipient sees persisted coordination message', Boolean(visibleMessage), JSON.stringify(recipientInbox.json));

  const dbRow = await queryMessageRow(messageId);
  assert('coordination message stored in database', Boolean(dbRow), JSON.stringify(dbRow));
  assert('database row preserves idempotency key', dbRow?.idempotencyKey === idempotencyKey, JSON.stringify(dbRow));
  assert('database row stores recipient visibility', Array.isArray(dbRow?.toAgents) && dbRow.toAgents.includes(recipient.username), JSON.stringify(dbRow));
  assert('database row starts unprocessed', dbRow?.processedAt === null, JSON.stringify(dbRow));

  const processed = await api('DELETE', `/api/v1/ops/coordination/${messageId}`, { token: recipient.token });
  assert('DELETE /api/v1/ops/coordination/:id → 200', processed.status === 200, `got ${processed.status}: ${JSON.stringify(processed.json)}`);
  assert('DELETE marks message processed', Boolean(processed.json?.message?.processedAt), JSON.stringify(processed.json));

  const filteredInbox = await api('GET', '/api/v1/ops/coordination?limit=20', { token: recipient.token });
  assert('processed message hidden from default inbox', !filteredInbox.json?.messages?.some((message) => message.id === messageId), JSON.stringify(filteredInbox.json));

  const includeProcessed = await api('GET', '/api/v1/ops/coordination?limit=20&include_processed=true', { token: recipient.token });
  const processedMessage = includeProcessed.json?.messages?.find((message) => message.id === messageId);
  assert('include_processed view returns message after processing', Boolean(processedMessage), JSON.stringify(includeProcessed.json));
  assert('include_processed view exposes processed timestamp', Boolean(processedMessage?.processedAt), JSON.stringify(processedMessage));

  const processedRow = await queryMessageRow(messageId);
  assert('database row keeps processed timestamp', Boolean(processedRow?.processedAt), JSON.stringify(processedRow));

  await finish();
}

main().catch(async (error) => {
  console.error(`\n${FAIL} runtime coordination persistence crashed: ${error.message}`);
  failures.push({ label: 'runtime coordination persistence crashed', detail: error.message });
  failed += 1;
  await finish();
});
