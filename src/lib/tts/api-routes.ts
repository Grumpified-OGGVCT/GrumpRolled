import { NextResponse } from 'next/server';

import { TTSManager, createTTSManagerFromEnv, type TTSRequest } from '@/lib/tts/multi-provider';

let ttsManager: TTSManager | null = null;

export function getTTSManager(): TTSManager {
  if (!ttsManager) {
    ttsManager = createTTSManagerFromEnv();
  }

  return ttsManager;
}

export async function handleTTSSynthesize(body: unknown) {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    const manager = getTTSManager();
    const ttsRequest: TTSRequest = {
      text,
      voice: typeof payload.voice === 'string' ? payload.voice : undefined,
      language: typeof payload.language === 'string' ? payload.language : undefined,
      speaker: typeof payload.speaker === 'string' ? payload.speaker : undefined,
      speed: typeof payload.speed === 'number' ? payload.speed : undefined,
    };

    const response = await manager.synthesize(
      ttsRequest,
      typeof payload.provider === 'string' ? payload.provider : undefined,
    );

    return new NextResponse(new Uint8Array(response.audio), {
      status: 200,
      headers: {
        'Content-Type': response.mimeType,
        'Content-Disposition': 'inline',
        'Cache-Control': response.cached ? 'public, max-age=86400' : 'no-cache',
        'X-TTS-Provider': response.provider,
        'X-TTS-Cached': String(response.cached),
      },
    });
  } catch (error) {
    console.error('TTS synthesis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'TTS synthesis failed' },
      { status: 500 },
    );
  }
}

export async function handleTTSHealth() {
  try {
    const manager = getTTSManager();
    const health = await manager.getAllHealthStatus();

    return NextResponse.json(
      {
        success: health.some((provider) => provider.healthy),
        providers: Object.fromEntries(health.map((provider) => [provider.name, provider.healthy])),
        details: health,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('TTS health error:', error);
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 });
  }
}

export async function handleTTSProvidersList() {
  try {
    const manager = getTTSManager();
    const providers = manager.listProviders();

    return NextResponse.json(
      {
        providers: providers.map((provider) => ({
          name: provider.name,
          enabled: provider.enabled,
          priority: provider.priority,
          endpoint: provider.endpoint,
          supportsCustomVoice: provider.supportsCustomVoice,
          supportsLanguages: provider.supportsLanguages,
          maxLength: provider.maxLength,
          requiresRefWav: provider.requiresRefWav,
        })),
        count: providers.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('List TTS providers error:', error);
    return NextResponse.json({ error: 'Failed to list providers' }, { status: 500 });
  }
}

export async function handleTTSProviderToggle(name: string, enabled: boolean) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return NextResponse.json({ error: 'Provider name is required' }, { status: 400 });
  }

  try {
    const manager = getTTSManager();
    const provider = manager.getProvider(normalizedName);

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    manager.setProviderEnabled(normalizedName, enabled);

    return NextResponse.json(
      {
        success: true,
        provider: normalizedName,
        enabled,
        message: `Provider ${normalizedName} ${enabled ? 'enabled' : 'disabled'}`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Toggle TTS provider error:', error);
    return NextResponse.json(
      { error: `Failed to ${enabled ? 'enable' : 'disable'} provider` },
      { status: 500 },
    );
  }
}

export async function handleTTSClearCache() {
  try {
    const manager = getTTSManager();
    manager.clearCache();
    return NextResponse.json({ success: true, message: 'TTS cache cleared' }, { status: 200 });
  } catch (error) {
    console.error('Clear TTS cache error:', error);
    return NextResponse.json({ error: 'Failed to clear cache' }, { status: 500 });
  }
}
