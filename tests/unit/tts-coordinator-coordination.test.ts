import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosPostMock = vi.fn();
const axiosGetMock = vi.fn();

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock,
    get: axiosGetMock,
  },
}));

describe('AgentTTSCoordinator shared coordination queue', () => {
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

    const { clearCoordinationMessagesForTests } = await import('../../src/lib/ops-coordination');
    clearCoordinationMessagesForTests();
  });

  it('shares coordination messages across coordinator instances', async () => {
    const { AgentTTSCoordinator } = await import('../../src/lib/agents/tts-coordinator');

    const alpha = new AgentTTSCoordinator('alpha', 'https://example.test');
    const bravo = new AgentTTSCoordinator('bravo', 'https://example.test');

    await alpha.coordinateWithAgents('review_plan', ['bravo'], { topic: 'ops' });

    expect(bravo.getPendingMessages()).toMatchObject([
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
    expect(bravo.getPendingMessages()).toMatchObject([
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

    submitCoordinationMessage({
      fromAgent: 'alpha',
      toAgents: ['bravo'],
      action: 'coordinate',
      payload: { task: 'older' },
      timestamp: '2026-01-01T00:00:00.000Z',
      idempotencyKey: 'older-key',
    });
    submitCoordinationMessage({
      fromAgent: 'alpha',
      toAgents: ['bravo'],
      action: 'coordinate',
      payload: { task: 'newer' },
      timestamp: '2026-01-01T00:00:01.000Z',
      idempotencyKey: 'newer-key',
    });

    const bravo = new AgentTTSCoordinator('bravo', 'https://example.test');

    expect(bravo.getPendingMessages().map((message) => message.payload.task)).toEqual(['newer', 'older']);

    bravo.clearProcessedMessages(1);

    expect(bravo.getPendingMessages().map((message) => message.payload.task)).toEqual(['older']);
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
