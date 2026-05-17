import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerAgentMock = vi.fn();
const ttsAccessMock = vi.fn();

const dbMock = {
  agent: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('../../src/lib/agents/tts-coordinator', () => ({
  checkMasterAgentTTSAccess: ttsAccessMock,
  MasterAgentCoordinator: class MockMasterAgentCoordinator {
    registerAgent(agentId: string) {
      registerAgentMock(agentId);
      return { agentId };
    }

    async monitorProvidersAndFailover() {
      return { mimic3: true, coqui: true, yourtts: true };
    }

    getCoordinationLog() {
      return [];
    }
  },
}));

describe('master agent initialization helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('setInterval', vi.fn(() => 1 as unknown as NodeJS.Timeout));
    vi.stubGlobal('clearInterval', vi.fn());
    ttsAccessMock.mockResolvedValue(true);
  });

  it('reads registered agents from postgres usernames', async () => {
    dbMock.agent.findMany.mockResolvedValue([
      { username: 'alpha' },
      { username: 'bravo' },
      { username: 'charlie' },
    ]);

    const { getRegisteredAgentsFromPostgres } = await import('../../src/lib/agents/master-agent-init');
    const agents = await getRegisteredAgentsFromPostgres();

    expect(dbMock.agent.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      select: { username: true },
    });
    expect(agents).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('falls back to built-in ids when postgres has no registered agents', async () => {
    dbMock.agent.findMany.mockResolvedValue([]);

    const { resolveMasterAgentIds, DEFAULT_MASTER_AGENT_IDS } = await import('../../src/lib/agents/master-agent-init');
    const agents = await resolveMasterAgentIds();

    expect(agents).toEqual([...DEFAULT_MASTER_AGENT_IDS]);
  });

  it('falls back to built-in ids when postgres lookup fails', async () => {
    dbMock.agent.findMany.mockRejectedValue(new Error('db unavailable'));

    const { resolveMasterAgentIds, DEFAULT_MASTER_AGENT_IDS } = await import('../../src/lib/agents/master-agent-init');
    const agents = await resolveMasterAgentIds();

    expect(agents).toEqual([...DEFAULT_MASTER_AGENT_IDS]);
  });

  it('initializes the master coordinator with registered postgres agents', async () => {
    dbMock.agent.findMany.mockResolvedValue([
      { username: 'alpha' },
      { username: 'bravo' },
    ]);

    const { initializeMasterAgent } = await import('../../src/lib/agents/master-agent-init');
    await initializeMasterAgent('https://example.test');

    expect(ttsAccessMock).toHaveBeenCalledWith('https://example.test');
    expect(registerAgentMock).toHaveBeenNthCalledWith(1, 'alpha');
    expect(registerAgentMock).toHaveBeenNthCalledWith(2, 'bravo');
    expect(registerAgentMock).toHaveBeenCalledTimes(2);
  });

  it('exposes the built-in master agent ids', async () => {
    const { DEFAULT_MASTER_AGENT_IDS } = await import('../../src/lib/agents/master-agent-init');

    expect(DEFAULT_MASTER_AGENT_IDS).toContain('agent-grump-main');
    expect(DEFAULT_MASTER_AGENT_IDS).toContain('agent-moderator');
  });
});
