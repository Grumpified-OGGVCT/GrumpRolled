/**
 * TTS Multi-Provider Abstraction Layer
 * 
 * Provides unified interface for multiple TTS engines (Mimic 3, Coqui, YourTTS)
 * with intelligent fallback, health checks, and provider management.
 */

import axios, { AxiosError } from 'axios';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * TTS Provider Configuration
 */
export interface TTSProviderConfig {
  name: 'mimic3' | 'coqui' | 'yourtts';
  endpoint: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  supportsCustomVoice?: boolean;
  supportsLanguages?: string[];
  maxLength?: number;
  requiresRefWav?: boolean;
}

/**
 * TTS Request Parameters
 */
export interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
  speaker?: string;
  speed?: number;
  refWav?: Buffer; // For YourTTS zero-shot
}

/**
 * TTS Response
 */
export interface TTSResponse {
  audio: Buffer;
  mimeType: 'audio/wav' | 'audio/mpeg' | 'audio/ogg';
  provider: string;
  duration?: number;
  cached: boolean;
}

/**
 * Provider Health Status
 */
export interface ProviderHealth {
  name: string;
  healthy: boolean;
  lastCheck: Date;
  latency?: number;
  error?: string;
}

/**
 * TTS Manager Configuration
 */
export interface TTSManagerConfig {
  cacheDir?: string;
  cacheTTL?: number; // seconds
  enableCache: boolean;
}

/**
 * TTS Multi-Provider Manager
 */
export class TTSManager {
  private providers: Map<string, TTSProviderConfig>;
  private health: Map<string, ProviderHealth>;
  private cacheDir: string;
  private cacheTTL: number;
  private enableCache: boolean;

  constructor(configs: TTSProviderConfig[], managerConfig?: TTSManagerConfig) {
    this.providers = new Map(configs.map((c) => [c.name, c]));
    this.health = new Map();
    this.cacheDir = managerConfig?.cacheDir || path.join(process.cwd(), '.tts-cache');
    this.cacheTTL = managerConfig?.cacheTTL || 3600;
    this.enableCache = managerConfig?.enableCache ?? true;

    // Initialize cache directory
    if (this.enableCache && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Initialize health status
    configs.forEach((c) => {
      this.health.set(c.name, {
        name: c.name,
        healthy: c.enabled,
        lastCheck: new Date(),
      });
    });
  }

  /**
   * Generate cache key from TTS request
   */
  private generateCacheKey(req: TTSRequest, provider: string): string {
    const hashInput = JSON.stringify({
      text: req.text,
      voice: req.voice || 'default',
      language: req.language || 'en',
      speaker: req.speaker || 'default',
      speed: req.speed || 1.0,
      provider,
    });
    return createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * Get cached audio if available
   */
  private getCachedAudio(cacheKey: string): Buffer | null {
    if (!this.enableCache) return null;

    const cacheFile = path.join(this.cacheDir, `${cacheKey}.wav`);
    if (fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      const ageSeconds = (Date.now() - stats.mtime.getTime()) / 1000;

      if (ageSeconds < this.cacheTTL) {
        return fs.readFileSync(cacheFile);
      } else {
        // Cache expired, delete
        fs.unlinkSync(cacheFile);
      }
    }
    return null;
  }

  /**
   * Save audio to cache
   */
  private setCachedAudio(cacheKey: string, audio: Buffer): void {
    if (!this.enableCache) return;

    const cacheFile = path.join(this.cacheDir, `${cacheKey}.wav`);
    fs.writeFileSync(cacheFile, audio);
  }

  /**
   * Get enabled providers sorted by priority
   */
  private getEnabledProviders(): TTSProviderConfig[] {
    return Array.from(this.providers.values())
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if provider is currently healthy
   */
  async checkProviderHealth(name: string): Promise<ProviderHealth> {
    const config = this.providers.get(name);
    if (!config) throw new Error(`Unknown provider: ${name}`);

    const health: ProviderHealth = {
      name,
      healthy: false,
      lastCheck: new Date(),
    };

    try {
      const start = Date.now();
      const response = await axios.get(`${config.endpoint}/health`, {
        timeout: 2000,
      });
      health.latency = Date.now() - start;
      health.healthy = response.status === 200;
    } catch (error) {
      health.error = error instanceof Error ? error.message : String(error);
      health.healthy = false;
    }

    this.health.set(name, health);
    return health;
  }

  /**
   * Get health status for all providers
   */
  async getAllHealthStatus(): Promise<ProviderHealth[]> {
    const providers = Array.from(this.providers.values());
    const results = await Promise.all(providers.map((p) => this.checkProviderHealth(p.name)));
    return results;
  }

  /**
   * Text-to-speech with auto-fallback to next provider
   */
  async synthesize(request: TTSRequest, forceProvider?: string): Promise<TTSResponse> {
    const enabledProviders = this.getEnabledProviders();
    if (enabledProviders.length === 0) {
      throw new Error('No TTS providers are enabled');
    }

    // If specific provider requested, try it first
    let providersToTry = enabledProviders;
    if (forceProvider) {
      const specific = enabledProviders.find((p) => p.name === forceProvider);
      if (specific) {
        providersToTry = [specific, ...enabledProviders.filter((p) => p.name !== forceProvider)];
      }
    }

    let lastError: Error | null = null;

    for (const provider of providersToTry) {
      try {
        // Check cache first
        const cacheKey = this.generateCacheKey(request, provider.name);
        const cached = this.getCachedAudio(cacheKey);
        if (cached) {
          return {
            audio: cached,
            mimeType: 'audio/wav',
            provider: provider.name,
            cached: true,
          };
        }

        // Try provider
        const response = await this.synthesizeWithProvider(request, provider);

        // Cache result
        this.setCachedAudio(cacheKey, response.audio);

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`TTS provider ${provider.name} failed:`, lastError.message);
        // Continue to next provider
      }
    }

    throw new Error(
      `All TTS providers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Call specific TTS provider
   */
  private async synthesizeWithProvider(
    request: TTSRequest,
    provider: TTSProviderConfig
  ): Promise<TTSResponse> {
    const start = Date.now();

    try {
      switch (provider.name) {
        case 'mimic3':
          return await this.callMimic3(request, provider);
        case 'coqui':
          return await this.callCoqui(request, provider);
        case 'yourtts':
          return await this.callYourTTS(request, provider);
        default:
          throw new Error(`Unknown provider: ${provider.name}`);
      }
    } finally {
      const latency = Date.now() - start;
      const health = this.health.get(provider.name);
      if (health) {
        health.latency = latency;
        health.healthy = true;
        health.lastCheck = new Date();
      }
    }
  }

  /**
   * Mimic 3 TTS Call
   */
  private async callMimic3(
    request: TTSRequest,
    provider: TTSProviderConfig
  ): Promise<TTSResponse> {
    const params = new URLSearchParams();
    params.append('text', request.text);
    params.append('voice', request.voice || 'default');
    params.append('speaker', request.speaker || 'default');
    if (request.speed !== undefined) {
      params.append('speed', String(request.speed));
    }

    const url = `${provider.endpoint}/api/v2/tts`;
    const response = await axios.get(url, {
      params: Object.fromEntries(params),
      responseType: 'arraybuffer',
      timeout: provider.timeout,
    });

    return {
      audio: Buffer.from(response.data),
      mimeType: 'audio/wav',
      provider: 'mimic3',
      cached: false,
    };
  }

  /**
   * Coqui TTS Call
   */
  private async callCoqui(
    request: TTSRequest,
    provider: TTSProviderConfig
  ): Promise<TTSResponse> {
    const payload = {
      text: request.text,
      speaker_idx: request.speaker || '0',
      language_idx: request.language || 'en',
    };

    const response = await axios.post(`${provider.endpoint}/api/tts`, payload, {
      responseType: 'arraybuffer',
      timeout: provider.timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    return {
      audio: Buffer.from(response.data),
      mimeType: 'audio/wav',
      provider: 'coqui',
      cached: false,
    };
  }

  /**
   * YourTTS Call (Zero-shot)
   */
  private async callYourTTS(
    request: TTSRequest,
    provider: TTSProviderConfig
  ): Promise<TTSResponse> {
    if (!request.refWav && !process.env.YOURTTS_REF_WAV) {
      throw new Error('YourTTS requires reference WAV (refWav or YOURTTS_REF_WAV env var)');
    }

    const refWavBase64 = request.refWav
      ? request.refWav.toString('base64')
      : process.env.YOURTTS_REF_WAV;

    const payload = {
      text: request.text,
      language: request.language || 'en',
      reference_wav: refWavBase64,
    };

    const response = await axios.post(`${provider.endpoint}/api/tts`, payload, {
      responseType: 'arraybuffer',
      timeout: provider.timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    return {
      audio: Buffer.from(response.data),
      mimeType: 'audio/wav',
      provider: 'yourtts',
      cached: false,
    };
  }

  /**
   * Get provider configuration
   */
  getProvider(name: string): TTSProviderConfig | undefined {
    return this.providers.get(name);
  }

  /**
   * Enable/disable provider
   */
  setProviderEnabled(name: string, enabled: boolean): void {
    const provider = this.providers.get(name);
    if (provider) {
      provider.enabled = enabled;
    }
  }

  /**
   * Get list of all providers
   */
  listProviders(): TTSProviderConfig[] {
    return Array.from(this.providers.values());
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(this.cacheDir, file));
      });
    }
  }
}

/**
 * Factory function to create TTSManager from environment variables
 */
export function createTTSManagerFromEnv(): TTSManager {
  const configs: TTSProviderConfig[] = [];

  // Mimic 3
  if (process.env.TTS_MIMIC3_ENDPOINT) {
    configs.push({
      name: 'mimic3',
      endpoint: process.env.TTS_MIMIC3_ENDPOINT,
      enabled: process.env.TTS_MIMIC3_ENABLED !== 'false',
      priority: 1,
      timeout: parseInt(process.env.TTS_MIMIC3_TIMEOUT || '5000'),
      supportsCustomVoice: true,
      supportsLanguages: ['en'],
      maxLength: 5000,
    });
  }

  // Coqui TTS
  if (process.env.TTS_COQUI_ENDPOINT) {
    configs.push({
      name: 'coqui',
      endpoint: process.env.TTS_COQUI_ENDPOINT,
      enabled: process.env.TTS_COQUI_ENABLED === 'true',
      priority: 2,
      timeout: parseInt(process.env.TTS_COQUI_TIMEOUT || '8000'),
      supportsLanguages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar'],
      maxLength: 10000,
    });
  }

  // YourTTS
  if (process.env.TTS_YOURTTS_ENDPOINT) {
    configs.push({
      name: 'yourtts',
      endpoint: process.env.TTS_YOURTTS_ENDPOINT,
      enabled: process.env.TTS_YOURTTS_ENABLED === 'true',
      priority: 3,
      timeout: parseInt(process.env.TTS_YOURTTS_TIMEOUT || '10000'),
      supportsLanguages: ['en', 'pt', 'es', 'fr', 'it', 'de'],
      maxLength: 15000,
      requiresRefWav: true,
    });
  }

  if (configs.length === 0) {
    throw new Error('No TTS providers configured. Set at least one TTS_*_ENDPOINT env var.');
  }

  return new TTSManager(configs, {
    enableCache: process.env.TTS_CACHE_RESPONSES !== 'false',
    cacheTTL: parseInt(process.env.TTS_CACHE_TTL || '3600'),
  });
}
