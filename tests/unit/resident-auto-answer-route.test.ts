import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateAgentMock = vi.fn();
const isAdminRequestMock = vi.fn();
const answerWithTriplePassMock = vi.fn();

const dbMock = {
  agent: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  question: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('@/lib/auth', () => ({
  authenticateAgentRequest: authenticateAgentMock,
}));

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

vi.mock('@/lib/ollama-cloud', () => ({
  answerWithTriplePass: answerWithTriplePassMock,
}));

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

describe('/api/v1/resident/grump/auto-answer route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    authenticateAgentMock.mockResolvedValue({ id: 'agent-1' });
    isAdminRequestMock.mockReturnValue(false);

    dbMock.agent.findUnique.mockResolvedValue({ isResident: true });
    dbMock.agent.findFirst.mockResolvedValue({ id: 'resident-1', username: 'grump', displayName: 'Grump' });
    dbMock.question.findFirst.mockResolvedValue({
      id: 'q-1',
      title: 'Test question',
      body: 'Test question body',
      answers: [],
    });

    answerWithTriplePassMock.mockResolvedValue({
      answer: 'Resident answer preview',
      confidence: 0.8,
      modelPrimary: 'deepseek-reasoner',
      modelVerifier: 'mistral-large-latest',
      selectionSummary: 'Resident selection summary',
      primaryTransparency: { provider_id: 'deepseek' },
      verifierTransparency: { provider_id: 'mistral' },
    });
  });

  it('returns dry_run output for an authorized resident caller', async () => {
    const { POST } = await import('../../src/app/api/v1/resident/grump/auto-answer/route');

    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer test' : null),
      },
      json: async () => ({ dry_run: true }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.status).toBe('dry_run');
    expect(body.preview).toBe('Resident answer preview');
    expect(body.quality.model_primary).toBe('deepseek-reasoner');
    expect(authenticateAgentMock).toHaveBeenCalled();
    expect(answerWithTriplePassMock).toHaveBeenCalledTimes(1);
  });
});
