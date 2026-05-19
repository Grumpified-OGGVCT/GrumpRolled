import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleTTSSynthesizeMock = vi.fn();
const handleTTSHealthMock = vi.fn();
const handleTTSProvidersListMock = vi.fn();
const handleTTSProviderToggleMock = vi.fn();
const handleTTSClearCacheMock = vi.fn();

vi.mock('@/lib/tts/api-routes', () => ({
  handleTTSSynthesize: handleTTSSynthesizeMock,
  handleTTSHealth: handleTTSHealthMock,
  handleTTSProvidersList: handleTTSProvidersListMock,
  handleTTSProviderToggle: handleTTSProviderToggleMock,
  handleTTSClearCache: handleTTSClearCacheMock,
}));

describe('TTS contract routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    handleTTSSynthesizeMock.mockResolvedValue(new Response('audio-bytes', { status: 200 }));
    handleTTSHealthMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    handleTTSProvidersListMock.mockResolvedValue(new Response(JSON.stringify({ providers: [] }), { status: 200 }));
    handleTTSProviderToggleMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    handleTTSClearCacheMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  });

  it('routes /tts/synthesize POST to the shared synth handler', async () => {
    const { POST } = await import('../../src/app/api/v1/tts/synthesize/route');
    const request = { json: async () => ({ text: 'hello' }) } as never;

    const response = await POST(request);

    expect(handleTTSSynthesizeMock).toHaveBeenCalledWith({ text: 'hello' });
    expect(response.status).toBe(200);
  });

  it('routes /tts/health GET to the shared health handler', async () => {
    const { GET } = await import('../../src/app/api/v1/tts/health/route');
    const response = await GET();

    expect(handleTTSHealthMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('routes /tts/providers GET to the shared providers handler', async () => {
    const { GET } = await import('../../src/app/api/v1/tts/providers/route');
    const response = await GET();

    expect(handleTTSProvidersListMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('routes provider enable/disable PUT requests with the param name', async () => {
    const enableRoute = await import('../../src/app/api/v1/tts/providers/[name]/enable/route');
    const disableRoute = await import('../../src/app/api/v1/tts/providers/[name]/disable/route');

    await enableRoute.PUT({} as never, { params: Promise.resolve({ name: 'mimic3' }) });
    await disableRoute.PUT({} as never, { params: Promise.resolve({ name: 'coqui' }) });

    expect(handleTTSProviderToggleMock).toHaveBeenNthCalledWith(1, 'mimic3', true);
    expect(handleTTSProviderToggleMock).toHaveBeenNthCalledWith(2, 'coqui', false);
  });

  it('routes /tts/cache DELETE to the shared cache-clear handler', async () => {
    const { DELETE } = await import('../../src/app/api/v1/tts/cache/route');
    const response = await DELETE();

    expect(handleTTSClearCacheMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('keeps the legacy /tts route as a synthesize alias and route guide', async () => {
    const route = await import('../../src/app/api/v1/tts/route');

    const postResponse = await route.POST({ json: async () => ({ text: 'legacy' }) } as never);
    const getResponse = await route.GET();
    const getBody = await getResponse.json();

    expect(handleTTSSynthesizeMock).toHaveBeenCalledWith({ text: 'legacy' });
    expect(postResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(getBody.routes.synthesize).toBe('/api/v1/tts/synthesize');
  });
});
