import { beforeEach, describe, expect, it, vi } from 'vitest';

const isAdminRequestMock = vi.fn();
const handleMasterAgentStatusMock = vi.fn();
const handleMasterAgentInitMock = vi.fn();
const handleGetCoordinationLogMock = vi.fn();
const handleBroadcastAnnouncementMock = vi.fn();

vi.mock('@/lib/admin', () => ({
  isAdminRequest: isAdminRequestMock,
}));

vi.mock('@/lib/agents/master-agent-init', () => ({
  handleMasterAgentStatus: handleMasterAgentStatusMock,
  handleMasterAgentInit: handleMasterAgentInitMock,
  handleGetCoordinationLog: handleGetCoordinationLogMock,
  handleBroadcastAnnouncement: handleBroadcastAnnouncementMock,
}));

function makeRequest(url: string, body?: unknown) {
  return {
    url,
    headers: new Headers(),
    cookies: { get: () => undefined },
    json: async () => body,
  } as never;
}

describe('master-agent api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequestMock.mockReturnValue(true);
  });

  it('guards status with admin auth and returns handler output', async () => {
    handleMasterAgentStatusMock.mockResolvedValue({ success: true, status: 'running' });

    const { GET } = await import('../../src/app/api/v1/master-agent/status/route');
    const response = await GET(makeRequest('https://example.test/api/v1/master-agent/status'));

    expect(response.status).toBe(200);
    expect(handleMasterAgentStatusMock).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ success: true, status: 'running' });
  });

  it('rejects status when request is not admin', async () => {
    isAdminRequestMock.mockReturnValue(false);

    const { GET } = await import('../../src/app/api/v1/master-agent/status/route');
    const response = await GET(makeRequest('https://example.test/api/v1/master-agent/status'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('passes trimmed baseUrl to init handler', async () => {
    handleMasterAgentInitMock.mockResolvedValue({ success: true, agents: ['alpha'] });

    const { POST } = await import('../../src/app/api/v1/master-agent/init/route');
    const response = await POST(makeRequest('https://example.test/api/v1/master-agent/init', { baseUrl: ' https://example.test/base ' }));

    expect(response.status).toBe(200);
    expect(handleMasterAgentInitMock).toHaveBeenCalledWith({ baseUrl: 'https://example.test/base' });
  });

  it('passes bounded limit to coordination log handler', async () => {
    handleGetCoordinationLogMock.mockResolvedValue({ success: true, count: 2, messages: [] });

    const { GET } = await import('../../src/app/api/v1/master-agent/coordination-log/route');
    const response = await GET(makeRequest('https://example.test/api/v1/master-agent/coordination-log?limit=999'));

    expect(response.status).toBe(200);
    expect(handleGetCoordinationLogMock).toHaveBeenCalledWith(200);
  });

  it('requires announcement text for broadcast', async () => {
    const { POST } = await import('../../src/app/api/v1/master-agent/broadcast-announcement/route');
    const response = await POST(makeRequest('https://example.test/api/v1/master-agent/broadcast-announcement', { announcement: '   ' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'announcement is required' });
  });

  it('passes sanitized announcement payload to broadcast handler', async () => {
    handleBroadcastAnnouncementMock.mockResolvedValue({ success: true, message: 'Announcement broadcast' });

    const { POST } = await import('../../src/app/api/v1/master-agent/broadcast-announcement/route');
    const response = await POST(
      makeRequest('https://example.test/api/v1/master-agent/broadcast-announcement', {
        announcement: '  Ship it  ',
        forumIds: [' core-engineering ', '', 'agent-showcase'],
      }),
    );

    expect(response.status).toBe(200);
    expect(handleBroadcastAnnouncementMock).toHaveBeenCalledWith({
      announcement: 'Ship it',
      forumIds: ['core-engineering', 'agent-showcase'],
    });
  });
});