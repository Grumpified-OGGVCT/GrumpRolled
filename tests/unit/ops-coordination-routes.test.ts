import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequestMock = vi.fn();
const authenticateAgentRequestMock = vi.fn();

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

vi.mock('@/lib/auth', () => ({
  authenticateAgentRequest: authenticateAgentRequestMock,
}));

function makeRequest(url: string, body?: unknown) {
  return {
    url,
    headers: new Headers(),
    cookies: { get: () => undefined },
    json: async () => body,
  } as never;
}

describe('ops coordination api routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    isAdminRequestMock.mockReturnValue(false);
    authenticateAgentRequestMock.mockResolvedValue(null);

    const { clearCoordinationMessagesForTests } = await import('../../src/lib/ops-coordination');
    clearCoordinationMessagesForTests();
  });

  it('rejects anonymous reads', async () => {
    const { GET } = await import('../../src/app/api/v1/ops/coordination/route');
    const response = await GET(makeRequest('https://example.test/api/v1/ops/coordination'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('forces agent-submitted messages to use the authenticated username', async () => {
    authenticateAgentRequestMock.mockResolvedValue({ id: 'agent-1', username: 'alpha' });

    const { POST } = await import('../../src/app/api/v1/ops/coordination/route');
    const response = await POST(
      makeRequest('https://example.test/api/v1/ops/coordination', {
        fromAgent: 'spoofed-admin',
        action: 'share',
        toAgents: [' bravo ', '', 'charlie', 'bravo'],
        payload: { topic: 'tts' },
        idempotencyKey: ' key-1 ',
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      duplicate: false,
      message: {
        fromAgent: 'alpha',
        action: 'share',
        toAgents: ['bravo', 'charlie'],
        payload: { topic: 'tts' },
        idempotencyKey: 'key-1',
      },
    });
  });

  it('deduplicates admin-submitted messages by idempotency key', async () => {
    isAdminRequestMock.mockReturnValue(true);

    const { POST } = await import('../../src/app/api/v1/ops/coordination/route');

    const first = await POST(
      makeRequest('https://example.test/api/v1/ops/coordination', {
        fromAgent: 'master-agent',
        action: 'health-check',
        payload: { provider: 'coqui' },
        idempotencyKey: 'dup-1',
      }),
    );

    const second = await POST(
      makeRequest('https://example.test/api/v1/ops/coordination', {
        fromAgent: 'master-agent',
        action: 'health-check',
        payload: { provider: 'coqui' },
        idempotencyKey: 'dup-1',
      }),
    );

    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(secondJson.duplicate).toBe(true);
    expect(secondJson.message.id).toBe(firstJson.message.id);
  });

  it('shows agents only broadcasts, direct messages, and their own sent messages', async () => {
    authenticateAgentRequestMock.mockResolvedValue({ id: 'agent-1', username: 'alpha' });

    const { submitCoordinationMessage } = await import('../../src/lib/ops-coordination');
    submitCoordinationMessage({
      fromAgent: 'master-agent',
      action: 'health-check',
      payload: { scope: 'all' },
    });
    submitCoordinationMessage({
      fromAgent: 'bravo',
      toAgents: ['alpha'],
      action: 'coordinate',
      payload: { task: 'review' },
    });
    submitCoordinationMessage({
      fromAgent: 'alpha',
      toAgents: ['charlie'],
      action: 'share',
      payload: { topic: 'done' },
    });
    submitCoordinationMessage({
      fromAgent: 'charlie',
      toAgents: ['delta'],
      action: 'share',
      payload: { topic: 'private' },
    });

    const { GET } = await import('../../src/app/api/v1/ops/coordination/route');
    const response = await GET(makeRequest('https://example.test/api/v1/ops/coordination?limit=999'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.viewer_scope).toBe('agent');
    expect(json.agent_filter).toBe('alpha');
    expect(json.messages).toHaveLength(3);
    expect(json.messages.map((message: { fromAgent: string }) => message.fromAgent).sort()).toEqual([
      'alpha',
      'bravo',
      'master-agent',
    ]);
  });

  it('lets admins inspect a specific agent view', async () => {
    isAdminRequestMock.mockReturnValue(true);

    const { submitCoordinationMessage } = await import('../../src/lib/ops-coordination');
    submitCoordinationMessage({
      fromAgent: 'master-agent',
      action: 'health-check',
      payload: { scope: 'all' },
    });
    submitCoordinationMessage({
      fromAgent: 'bravo',
      toAgents: ['alpha'],
      action: 'coordinate',
      payload: { task: 'review' },
    });
    submitCoordinationMessage({
      fromAgent: 'alpha',
      toAgents: ['charlie'],
      action: 'share',
      payload: { topic: 'done' },
    });
    submitCoordinationMessage({
      fromAgent: 'charlie',
      toAgents: ['delta'],
      action: 'share',
      payload: { topic: 'private' },
    });

    const { GET } = await import('../../src/app/api/v1/ops/coordination/route');
    const response = await GET(makeRequest('https://example.test/api/v1/ops/coordination?agent=alpha&limit=999'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.viewer_scope).toBe('owner');
    expect(json.agent_filter).toBe('alpha');
    expect(json.messages).toHaveLength(3);
  });

  it('allows visible agents to mark messages processed', async () => {
    authenticateAgentRequestMock.mockResolvedValue({ id: 'agent-1', username: 'alpha' });

    const { submitCoordinationMessage, listCoordinationMessages } = await import('../../src/lib/ops-coordination');
    const created = submitCoordinationMessage({
      fromAgent: 'bravo',
      toAgents: ['alpha'],
      action: 'coordinate',
      payload: { task: 'review' },
    });

    const { DELETE } = await import('../../src/app/api/v1/ops/coordination/[id]/route');
    const response = await DELETE(
      makeRequest(`https://example.test/api/v1/ops/coordination/${created.message.id}`),
      { params: Promise.resolve({ id: created.message.id }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: {
        id: created.message.id,
        processedAt: expect.any(String),
      },
    });
    expect(listCoordinationMessages({ agent: 'alpha', includeSentByAgent: true })).toHaveLength(0);
  });

  it('blocks agents from processing unrelated messages', async () => {
    authenticateAgentRequestMock.mockResolvedValue({ id: 'agent-1', username: 'alpha' });

    const { submitCoordinationMessage } = await import('../../src/lib/ops-coordination');
    const created = submitCoordinationMessage({
      fromAgent: 'bravo',
      toAgents: ['charlie'],
      action: 'coordinate',
      payload: { task: 'private-review' },
    });

    const { DELETE } = await import('../../src/app/api/v1/ops/coordination/[id]/route');
    const response = await DELETE(
      makeRequest(`https://example.test/api/v1/ops/coordination/${created.message.id}`),
      { params: Promise.resolve({ id: created.message.id }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });
});
