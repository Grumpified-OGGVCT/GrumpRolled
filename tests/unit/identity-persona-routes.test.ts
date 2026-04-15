import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateAgentMock = vi.fn();

const dbMock = {
  agentIdentityBirth: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  personaStateEvent: {
    create: vi.fn(),
  },
};

vi.mock('@/lib/auth', () => ({
  authenticateAgentRequest: authenticateAgentMock,
}));

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

describe('identity persona lifecycle routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    authenticateAgentMock.mockResolvedValue({ id: 'agent-1', username: 'tester' });
  });

  it('prevents recreating birth records once one exists', async () => {
    dbMock.agentIdentityBirth.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      status: 'ACTIVE',
      personaState: 'LOCKED',
    });

    const { POST } = await import('../../src/app/api/v1/identity/birth/route');
    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer ok' : null),
      },
      json: async () => ({
        source_platform: 'CHATOVERFLOW',
        persona_snapshot: { display_name: 'Tester' },
        reason: 'Initial link import for persona continuity',
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Identity birth already exists. Use the lifecycle endpoints instead of recreating the birth record.',
    });
  });

  it('requires reason for lock/unlock transitions', async () => {
    const { POST } = await import('../../src/app/api/v1/identity/persona/lock/route');
    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer ok' : null),
      },
      json: async () => ({ action: 'LOCK', reason: 'short' }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'reason is required and must be at least 8 characters for persona lock/unlock.',
    });
  });

  it('allows revoke with explicit reason and records a lifecycle event', async () => {
    dbMock.agentIdentityBirth.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      personaState: 'LOCKED',
      status: 'ACTIVE',
    });
    dbMock.agentIdentityBirth.update.mockResolvedValue({
      agentId: 'agent-1',
      personaState: 'REVOKED',
      status: 'REVOKED',
      revokedAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const { POST } = await import('../../src/app/api/v1/identity/persona/revoke/route');
    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer ok' : null),
      },
      json: async () => ({ reason: 'Revoke current persona after ownership compromise.' }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.persona_state).toBe('REVOKED');
    expect(dbMock.personaStateEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REVOKE',
          reason: 'Revoke current persona after ownership compromise.',
        }),
      })
    );
  });

  it('only allows rebind from a revoked persona record', async () => {
    dbMock.agentIdentityBirth.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      personaState: 'LOCKED',
      status: 'ACTIVE',
    });

    const { POST } = await import('../../src/app/api/v1/identity/persona/rebind/route');
    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer ok' : null),
      },
      json: async () => ({
        source_platform: 'CHATOVERFLOW',
        persona_snapshot: { display_name: 'Tester' },
        reason: 'Rebinding identity after external ownership revalidation.',
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Rebind requires a revoked persona record.',
    });
  });
});