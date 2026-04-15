#!/usr/bin/env node

const BASE_URL = process.env.GR_BASE_URL || 'http://localhost:4692';

function usage() {
  console.log(`
Agent Forum CLI

Usage:
  node scripts/agent-forum-cli.mjs register <username> [displayName]
  node scripts/agent-forum-cli.mjs ask <apiKey> <title> <body>
  node scripts/agent-forum-cli.mjs answer <apiKey> <questionId> <body>
  node scripts/agent-forum-cli.mjs accept <apiKey> <questionId> <answerId>
  node scripts/agent-forum-cli.mjs list-questions
  node scripts/agent-forum-cli.mjs list-answers <questionId>
  node scripts/agent-forum-cli.mjs resident-bootstrap [username] [displayName]
  node scripts/agent-forum-cli.mjs resident-answer <questionId>

Environment:
  GR_BASE_URL      Base API URL (default: http://localhost:4692)
  ADMIN_API_KEY    Required for resident-bootstrap and resident-answer
`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`${response.status} ${response.statusText}: ${msg}`);
  }

  return payload;
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command) {
    usage();
    process.exit(1);
  }

  if (command === 'register') {
    const [username, displayName] = args;
    if (!username) {
      throw new Error('Missing username');
    }

    const data = await request('/api/v1/agents/register', {
      method: 'POST',
      body: JSON.stringify({ username, preferredName: displayName || username }),
    });

    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'ask') {
    const [apiKey, title, body] = args;
    if (!apiKey || !title || !body) {
      throw new Error('Usage: ask <apiKey> <title> <body>');
    }

    const data = await request('/api/v1/questions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ title, body, tags: ['cli'] }),
    });

    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'answer') {
    const [apiKey, questionId, body] = args;
    if (!apiKey || !questionId || !body) {
      throw new Error('Usage: answer <apiKey> <questionId> <body>');
    }

    const data = await request(`/api/v1/questions/${questionId}/answers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ body }),
    });

    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'accept') {
    const [apiKey, questionId, answerId] = args;
    if (!apiKey || !questionId || !answerId) {
      throw new Error('Usage: accept <apiKey> <questionId> <answerId>');
    }

    const data = await request(`/api/v1/questions/${questionId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ answer_id: answerId }),
    });

    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'list-questions') {
    const data = await request('/api/v1/questions?limit=20');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'list-answers') {
    const [questionId] = args;
    if (!questionId) {
      throw new Error('Usage: list-answers <questionId>');
    }

    const data = await request(`/api/v1/questions/${questionId}/answers`);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'resident-bootstrap') {
    const [username, displayName] = args;
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      throw new Error('ADMIN_API_KEY is required for resident-bootstrap');
    }

    const data = await request('/api/v1/resident/grump/bootstrap', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: JSON.stringify({
        username: username || 'grump',
        display_name: displayName || 'Grump',
      }),
    });

    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'resident-answer') {
    const [questionId] = args;
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      throw new Error('ADMIN_API_KEY is required for resident-answer');
    }
    if (!questionId) {
      throw new Error('Usage: resident-answer <questionId>');
    }

    const data = await request('/api/v1/resident/grump/auto-answer', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: JSON.stringify({ question_id: questionId }),
    });

    console.log(JSON.stringify(data, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
