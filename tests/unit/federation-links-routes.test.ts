import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticateAgentMock = vi.fn();
const generateChallengeCodeMock = vi.fn();
const ensureFederatedSummaryMock = vi.fn();

const dbMock = {
  federatedLink: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  adminActionLog: {
    create: vi.fn(),
  },
};

vi.mock('@/lib/auth', () => ({
  authenticateAgentRequest: authenticateAgentMock,
  generateChallengeCode: generateChallengeCodeMock,
}));

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/federation-read', () => ({
  ensureFederatedSummary: ensureFederatedSummaryMock,
}));

describe('federation link routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    authenticateAgentMock.mockResolvedValue({ id: 'agent-1', username: 'tester' });
    generateChallengeCodeMock.mockReturnValue('grmp_verify_1234567890abcdef1234567890abcdef');
    ensureFederatedSummaryMock.mockResolvedValue({ profile: { reputation: 68 } });
  });

  it('does not silently downgrade an already verified unchanged link', async () => {
    dbMock.federatedLink.findUnique.mockResolvedValue({
      id: 'link-1',
      platform: 'CHATOVERFLOW',
      externalUsername: 'tester_bot',
      externalProfileUrl: 'https://chatoverflow.dev/u/tester_bot',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const { POST } = await import('../../src/app/api/v1/federation/links/route');
    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer ok' : null),
      },
      json: async () => ({
        platform: 'CHATOVERFLOW',
        external_username: 'tester_bot',
        external_profile_url: 'https://chatoverflow.dev/u/tester_bot',
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verification_status).toBe('VERIFIED');
    expect(body.challenge_code).toBeNull();
    expect(dbMock.federatedLink.upsert).not.toHaveBeenCalled();
  });

  it('nulls the challenge code after successful verification and logs the action', async () => {
    dbMock.federatedLink.findUnique.mockResolvedValue({
      id: 'link-1',
      platform: 'CHATOVERFLOW',
      externalUsername: 'tester_bot',
      verificationStatus: 'PENDING',
      verificationCode: 'grmp_verify_1234567890abcdef1234567890abcdef',
      verifiedAt: null,
    });
    dbMock.federatedLink.update.mockResolvedValue({
      id: 'link-1',
      platform: 'CHATOVERFLOW',
      externalUsername: 'tester_bot',
      verificationStatus: 'VERIFIED',
      verificationCode: null,
      verifiedAt: new Date('2026-04-01T01:00:00.000Z'),
    });

    const { POST } = await import('../../src/app/api/v1/federation/links/verify/route');
    const response = await POST({
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? 'Bearer ok' : null),
      },
      json: async () => ({
        platform: 'CHATOVERFLOW',
        challenge_code: 'grmp_verify_1234567890abcdef1234567890abcdef',
      }),
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verification_status).toBe('VERIFIED');
    expect(dbMock.federatedLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verificationCode: null,
        }),
      })
    );
    expect(dbMock.adminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FEDERATION_LINK_VERIFY',
        }),
      })
    );
  });
});