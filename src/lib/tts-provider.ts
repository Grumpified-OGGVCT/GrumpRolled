/**
 * Multi-provider TTS abstraction layer
 * Supports Mimic 3, Coqui TTS, YourTTS with dynamic fallback
 */

import axios from 'axios';

export type TTSProvider = 'mimic3' | 'coqui' | 'yourtts';
export type TTSLanguage = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'zh' | 'ar';

export interface TTSRequest {
  text: string;
  speaker?: string;
  language?: TTSLanguage;
  quality?: 'fast' | 'balanced' | 'high';
  preferredProvider?: TTSProvider;
}

export interface TTSResponse {
  audioBlob: Blob;
  provider: TTSProvider;
  speaker: string;
  duration: number; // in seconds
  cached: boolean;
}

export interface ProviderConfig {
  enabled: boolean;
  endpoint: string;
  timeout: number; // in ms
  priority: number; // lower = tried first
  fallback: boolean; // whether to try next provider on failure
}

export interface TTSConfig {
  mimic3?: ProviderConfig;
  coqui?: ProviderConfig;
  yourtts?: ProviderConfig;
  cacheResponses?: boolean;
  cacheTTL?: number; // in seconds
}

const DEFAULT_CONFIG: TTSConfig = {
  mimic3: {
    enabled: true,
    endpoint: process.env.TTS_MIMIC3_ENDPOINT || 'http://localhost:5002',
    timeout: 5000,
    priority: 1,
    fallback: true,
  },
  coqui: {
    enabled: false,
    endpoint: process.env.TTS_COQUI_ENDPOINT || 'http://localhost:5003',
    timeout: 8000,
    priority: 2,
    fallback: true,
  },
  yourtts: {
    enabled: false,
    endpoint: process.env.TTS_YOURTTS_ENDPOINT || 'http://localhost:5004',
    timeout: 10000,
    priority: 3,
    fallback: true,
  },
  cacheResponses: true,
  cacheTTL: 3600, // 1 hour
};

class TTSProviderManager {
  private config: TTSConfig;
  private cache: Map<string, { blob: Blob; timestamp: number }> = new Map();

  constructor(config: TTSConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point: synthesize speech with automatic provider selection
   */
  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    const cacheKey = this.generateCacheKey(request);

    // Check cache first
    if (this.config.cacheResponses) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          audioBlob: cached,
          provider: request.preferredProvider || 'mimic3',
          speaker: request.speaker || 'default',
          duration: 0, // would need to calculate
          cached: true,
        };
      }
    }

    // Try providers in priority order
    const providers = this.getProviderPriority(request.preferredProvider);

    for (const provider of providers) {
      const config = this.config[provider as keyof TTSConfig] as ProviderConfig;

      try {
        if (!config?.enabled) {
          console.log(`[TTS] Provider ${provider} disabled, skipping`);
          continue;
        }

        console.log(`[TTS] Trying provider: ${provider}`);
        const audioBlob = await this.callProvider(provider, request, config);

        // Cache the result
        if (this.config.cacheResponses) {
          this.setInCache(cacheKey, audioBlob);
        }

        return {
          audioBlob,
          provider: provider as TTSProvider,
          speaker: request.speaker || 'default',
          duration: 0,
          cached: false,
        };
      } catch (error) {
        console.warn(`[TTS] Provider ${provider} failed:`, error);

        if (!config?.fallback) {
          throw error; // Don't fall back if disabled
        }
      }
    }

    throw new Error('All TTS providers failed');
  }

  /**
   * Call specific TTS provider API
   */
  private async callProvider(
    provider: TTSProvider,
    request: TTSRequest,
    config: ProviderConfig
  ): Promise<Blob> {
    switch (provider) {
      case 'mimic3':
        return this.callMimic3(request, config);

      case 'coqui':
        return this.callCoqui(request, config);

      case 'yourtts':
        return this.callYourTTS(request, config);

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Mimic 3 API call
   * POST /api/tts with {text, speaker}
   */
  private async callMimic3(request: TTSRequest, config: ProviderConfig): Promise<Blob> {
    const response = await axios.post(
      `${config.endpoint}/api/tts`,
      {
        text: request.text,
        speaker: request.speaker || 'default',
      },
      {
        responseType: 'arraybuffer',
        timeout: config.timeout,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return new Blob([response.data], { type: 'audio/wav' });
  }

  /**
   * Coqui TTS API call
   * POST /api/tts with {text, speaker_name, language}
   */
  private async callCoqui(request: TTSRequest, config: ProviderConfig): Promise<Blob> {
    const response = await axios.post(
      `${config.endpoint}/api/tts`,
      {
        text: request.text,
        speaker_name: request.speaker || 'default',
        language: request.language || 'en',
      },
      {
        responseType: 'arraybuffer',
        timeout: config.timeout,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return new Blob([response.data], { type: 'audio/wav' });
  }

  /**
   * YourTTS API call
   * POST /tts with {text, ref_wav (base64), language}
   */
  private async callYourTTS(request: TTSRequest, config: ProviderConfig): Promise<Blob> {
    // YourTTS needs a reference wav file (base64) for zero-shot adaptation
    // For now, we'll use a default reference or skip if not provided
    const refWav = process.env.YOURTTS_REF_WAV || '';

    const response = await axios.post(
      `${config.endpoint}/tts`,
      {
        text: request.text,
        ref_wav: refWav,
        language: request.language || 'en',
      },
      {
        responseType: 'arraybuffer',
        timeout: config.timeout,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return new Blob([response.data], { type: 'audio/wav' });
  }

  /**
   * Get provider priority order (respecting preferred provider)
   */
  private getProviderPriority(preferred?: TTSProvider): TTSProvider[] {
    const providers: Array<[TTSProvider, ProviderConfig]> = [
      ['mimic3', this.config.mimic3!],
      ['coqui', this.config.coqui!],
      ['yourtts', this.config.yourtts!],
    ];

    // Sort by priority
    providers.sort((a, b) => a[1].priority - b[1].priority);

    // If preferred provider is specified, try it first
    if (preferred) {
      return [preferred, ...providers.map((p) => p[0]).filter((p) => p !== preferred)];
    }

    return providers.map((p) => p[0]);
  }

  /**
   * Generate cache key from request
   */
  private generateCacheKey(request: TTSRequest): string {
    return `${request.text}:${request.speaker || 'default'}:${request.language || 'en'}`;
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(key: string): Blob | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = (Date.now() - entry.timestamp) / 1000;
    if (age > (this.config.cacheTTL || 3600)) {
      this.cache.delete(key);
      return null;
    }

    return entry.blob;
  }

  /**
   * Set in cache
   */
  private setInCache(key: string, blob: Blob): void {
    this.cache.set(key, {
      blob,
      timestamp: Date.now(),
    });
  }

  /**
   * Check provider health
   */
  async checkProviderHealth(provider: TTSProvider): Promise<boolean> {
    try {
      const config = this.config[provider as keyof TTSConfig] as ProviderConfig;

      if (!config?.enabled) {
        return false;
      }

      const response = await axios.get(`${config.endpoint}/health`, {
        timeout: 2000,
      });

      return response.status === 200;
    } catch (error) {
      console.warn(`[TTS] Health check failed for ${provider}:`, error);
      return false;
    }
  }

  /**
   * Get status of all providers
   */
  async getProviderStatus(): Promise<Record<TTSProvider, boolean>> {
    return {
      mimic3: await this.checkProviderHealth('mimic3'),
      coqui: await this.checkProviderHealth('coqui'),
      yourtts: await this.checkProviderHealth('yourtts'),
    };
  }

  /**
   * Update provider config at runtime
   */
  updateConfig(updates: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[TTS] Config updated:', this.config);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[TTS] Cache cleared');
  }
}

// Export singleton instance
export const ttsManager = new TTSProviderManager();

// Export manager class for testing/multiple instances
export { TTSProviderManager };
