/**
 * useMultiProviderTTS Hook
 * 
 * React hook for client-side TTS synthesis with multi-provider support
 * Automatically handles provider fallback and caching
 */

import { useState, useCallback, useEffect } from 'react';

export interface UseTTSOptions {
  voice?: string;
  language?: string;
  speaker?: string;
  speed?: number;
  forceProvider?: 'mimic3' | 'coqui' | 'yourtts';
}

export interface TTSStatus {
  isLoading: boolean;
  isPlaying: boolean;
  error: string | null;
  provider: string | null;
  cached: boolean;
}

export function useMultiProviderTTS() {
  const [status, setStatus] = useState<TTSStatus>({
    isLoading: false,
    isPlaying: false,
    error: null,
    provider: null,
    cached: false,
  });

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  // Initialize audio element on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAudio(new Audio());
    }
  }, []);

  /**
   * Synthesize and play speech
   */
  const speak = useCallback(
    async (text: string, options?: UseTTSOptions) => {
      if (!text) {
        setStatus((s) => ({ ...s, error: 'Text is required' }));
        return;
      }

      setStatus({ isLoading: true, isPlaying: false, error: null, provider: null, cached: false });

      try {
        const response = await fetch('/api/v1/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: options?.voice,
            language: options?.language,
            speaker: options?.speaker,
            speed: options?.speed,
            provider: options?.forceProvider,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'TTS synthesis failed');
        }

        // Get audio blob and metadata from headers
        const blob = await response.blob();
        const provider = response.headers.get('X-TTS-Provider');
        const cached = response.headers.get('X-TTS-Cached') === 'true';

        if (audio) {
          const url = URL.createObjectURL(blob);
          audio.src = url;
          audio.onplay = () => {
            setStatus((s) => ({ ...s, isLoading: false, isPlaying: true, provider, cached }));
          };
          audio.onended = () => {
            setStatus((s) => ({ ...s, isPlaying: false }));
            URL.revokeObjectURL(url);
          };
          audio.onerror = (error) => {
            setStatus((s) => ({
              ...s,
              isLoading: false,
              error: 'Playback error: ' + String(error),
            }));
          };

          await audio.play();
        } else {
          setStatus((s) => ({ ...s, isLoading: false, error: 'Audio element not available' }));
        }
      } catch (error) {
        setStatus((s) => ({
          ...s,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    },
    [audio]
  );

  /**
   * Stop playback
   */
  const stop = useCallback(() => {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      setStatus((s) => ({ ...s, isPlaying: false }));
    }
  }, [audio]);

  /**
   * Pause playback
   */
  const pause = useCallback(() => {
    if (audio) {
      audio.pause();
      setStatus((s) => ({ ...s, isPlaying: false }));
    }
  }, [audio]);

  /**
   * Resume playback
   */
  const resume = useCallback(() => {
    if (audio) {
      audio.play();
      setStatus((s) => ({ ...s, isPlaying: true }));
    }
  }, [audio]);

  return {
    ...status,
    speak,
    stop,
    pause,
    resume,
  };
}

/**
 * Hook to check TTS provider health
 */
export function useTTSHealth() {
  const [health, setHealth] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/tts/health');
      if (!response.ok) throw new Error('Health check failed');

      const data = await response.json();
      setHealth(data.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return { health, loading, error, refetch: checkHealth };
}

/**
 * Hook to list available TTS providers
 */
export function useTTSProviders() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/tts/providers');
      if (!response.ok) throw new Error('Failed to list providers');

      const data = await response.json();
      setProviders(data.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const setProviderEnabled = useCallback(async (name: string, enabled: boolean) => {
    const endpoint = enabled
      ? `/api/v1/tts/providers/${name}/enable`
      : `/api/v1/tts/providers/${name}/disable`;

    try {
      const response = await fetch(endpoint, { method: 'PUT' });
      if (!response.ok) throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} provider`);

      // Refresh provider list
      await listProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [listProviders]);

  useEffect(() => {
    listProviders();
  }, [listProviders]);

  return { providers, loading, error, listProviders, setProviderEnabled };
}

/**
 * Hook to manage TTS cache
 */
export function useTTSCache() {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearCache = useCallback(async () => {
    setClearing(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/tts/cache', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to clear cache');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setClearing(false);
    }
  }, []);

  return { clearCache, clearing, error };
}
