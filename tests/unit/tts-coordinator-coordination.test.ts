import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosPostMock = vi.fn();
const axiosGetMock = vi.fn();
let coordinationStore: Array<{
  id: string;
  fromAgent: string;
  toAgents: string[];
  action: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  idempotencyKey: string;
  processedAt: Date | null;
}> = [];
let coordinationCounter = 0;

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock,
    get: axiosGetMock,
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    coordinationMessage: {
      create: vi.fn(async ({ data }: { data: { fromAgent: string; toAgents: string[]; action: string; payload: Record<string, unknown>; timestamp: Date; idempotencyKey: string } }) => {
        const duplicate = coordinationStore.find((message) => message.idempotencyKey === data.idempotencyKey);
        if (duplicate) {
          throw { code: 'P2002' };
        }

        const created = {
          id: `coord-${++coordinationCounter}`,
          fromAgent: data.fromAgent,
          toAgents: [...data.toAgents],
          action: data.action,
          payload: data.payload,
          timestamp: data.timestamp,
          idempotencyKey: data.idempotencyKey,
          processedAt: null,
        };

        coordinationStore.push(created);
        return created;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
        if (where.id) {
          return coordinationStore.find((message) => message.id === where.id) ?? null;
        }
        if (where.idempotencyKey) {
          return coordinationStore.find((message) => message.idempotencyKey === where.idempotencyKey) ?? null;
        }
        return null;
      }),
      findMany: vi.fn(async ({ where, take }: { where?: { processedAt?: null; OR?: Array<{ toAgents?: { isEmpty?: boolean; has?: string }; fromAgent?: string }> }; take?: number }) => {
        let results = [...coordinationStore];

        if (where?.processedAt === null) {
          results = results.filter((message) => message.processedAt === null);
        }

        if (where?.OR?.length) {
          results = results.filter((message) =>
            where.OR!.some((rule) => {
              if (rule.fromAgent) {
                return message.fromAgent === rule.fromAgent;
              }
              if (rule.toAgents?.isEmpty) {
                return message.toAgents.length === 0;
              }
              if (rule.toAgents?.has) {
                return message.toAgents.includes(rule.toAgents.has);
              }
              return false;
            }),
          );
        }

        results.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
        return typeof take === 'number' ? results.slice(0, take) : results;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { processedAt: Date } }) => {
        const message = coordinationStore.find((entry) => entry.id === where.id);
        if (!message) {
          throw new Error('not found');
        }
        message.processedAt = data.processedAt;
        return message;
      }),
      deleteMany: vi.fn(async () => {
        coordinationStore = [];
        coordinationCounter = 0;
        return { count: 0 };
      }),
    },
  },
}));

describe('AgentTTSCoordinator shared coordination queue', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    coordinationStore = [];
    coordinationCounter = 0;
    axiosPostMock.mockResolvedValue({
      headers: {
        'x-tts-provider': 'mimic3',
        'x-tts-cached': 'false',
        'content-type': 'audio/wav',
      },
      data: new ArrayBuffer(0),
    });
    axiosGetMock.mockResolvedValue({
      status: 200,
      data: { providers: { mimic3: true, coqui: true, yourtts: false } },
    });

    const { clearCoordinationMessagesForTests } = await import('../../src/lib/ops-coordination');
    await clearCoordinationMessagesForTests();
  });

  it('shares coordination messages across coordinator instances', async () => {
    const { AgentTTSCoordinator } = await import('../../src/lib/agents/tts-coordinator');

    const alpha = new AgentTTSCoordinator('alpha', 'https://example.test');
    const bravo = new AgentTTSCoordinator('bravo', 'https://example.test');

    await alpha.coordinateWithAgents('review_plan', ['bravo'], { topic: 'ops' });

    await expect(bravo.getPendingMessages()).resolves.toMatchObject([
      {
        fromAgent: 'alpha',
        toAgents: ['bravo'],
        action: 'coordinate',
        payload: {
          action: 'review_plan',
          topic: 'ops',
        },
      },
    ]);
  });

  it('broadcasts synthesized audio through the shared coordination queue', async () => {
    const { AgentTTSCoordinator } = await import('../../src/lib/agents/tts-coordinator');

    const alpha = new AgentTTSCoordinator('alpha', 'https://example.test');
    const bravo = new AgentTTSCoordinator('bravo', 'https://example.test');

    await alpha.synthesizeAndBroadcast('hello agents', ['bravo'], { provider: 'mimic3' });

    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://example.test/api/v1/tts/synthesize',
      { text: 'hello agents', provider: 'mimic3' },
      expect.objectContaining({ responseType: 'arraybuffer', timeout: 15000 }),
    );
    await expect(bravo.getPendingMessages()).resolves.toMatchObject([
      {
        fromAgent: 'alpha',
        toAgents: ['bravo'],
        action: 'share',
        payload: {
          text: 'hello agents',
          provider: 'mimic3',
          audioUrl: expect.stringContaining('/api/v1/tts/audio/mimic3/fresh/'),
        },
      },
    ]);
  });

  it('marks the requested number of visible messages as processed', async () => {
    const { AgentTTSCoordinator } = await import('../../src/lib/agents/tts-coordinator');
    const { submitCoordinationMessage } = await import('../../src/lib/ops-coordination');

    await submitCoordinationMessage({
      fromAgent: 'alpha',
      toAgents: ['bravo'],
      action: 'coordinate',
      payload: { task: 'older' },
      timestamp: '2026-01-01T00:00:00.000Z',
      idempotencyKey: 'older-key',
    });
    await submitCoordinationMessage({
      fromAgent: 'alpha',
      toAgents: ['bravo'],
      action: 'coordinate',
      payload: { task: 'newer' },
      timestamp: '2026-01-01T00:00:01.000Z',
      idempotencyKey: 'newer-key',
    });

    const bravo = new AgentTTSCoordinator('bravo', 'https://example.test');

    await expect(bravo.getPendingMessages()).resolves.toMatchObject([
      { payload: { task: 'newer' } },
      { payload: { task: 'older' } },
    ]);

    await bravo.clearProcessedMessages(1);

    await expect(bravo.getPendingMessages()).resolves.toMatchObject([
      { payload: { task: 'older' } },
    ]);
  });
});

describe('MasterAgentCoordinator coordination logging', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    axiosPostMock.mockResolvedValue({
      headers: {
        'x-tts-provider': 'mimic3',
        'x-tts-cached': 'false',
        'content-type': 'audio/wav',
      },
      data: new ArrayBuffer(0),
    });
    axiosGetMock.mockResolvedValue({
      status: 200,
      data: { providers: { mimic3: true, coqui: true, yourtts: false } },
    });
  });

  it('records broadcast synthesis and health-check events in the coordination log', async () => {
    const { MasterAgentCoordinator } = await import('../../src/lib/agents/tts-coordinator');

    const master = new MasterAgentCoordinator('https://example.test');
    master.registerAgent('alpha');
    master.registerAgent('bravo');

    await master.broadcastSynthesis('system check');
    await master.monitorProvidersAndFailover();

    const log = master.getCoordinationLog(10);

    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({
      fromAgent: 'master-agent',
      action: 'synthesize',
      toAgents: ['alpha', 'bravo'],
      payload: expect.objectContaining({
        requestedAgentCount: 2,
        successfulAgentCount: 2,
      }),
    });
    expect(log[1]).toMatchObject({
      fromAgent: 'master-agent',
      action: 'health-check',
      payload: {
        providers: { mimic3: true, coqui: true, yourtts: false },
      },
    });
  });
});
