'use client';

import { useCallback, useState } from 'react';

import { getActionErrorMessage, handleSessionActionError } from '@/hooks/use-session-status';

type MutationRunOptions<Result> = {
  successMessage?: string;
  errorMessage?: string;
  sessionExpiredDescription?: string;
  clearMessageBeforeRun?: boolean;
  suppressErrorMessage?: boolean;
  onSuccess?: (result: Result) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};

type UseClientMutationOptions = {
  contextLabel?: string;
};

export function useClientMutation({ contextLabel }: UseClientMutationOptions = {}) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  const run = useCallback(
    async <Result,>(task: () => Promise<Result>, options: MutationRunOptions<Result> = {}) => {
      setIsRunning(true);

      if (options.clearMessageBeforeRun !== false) {
        setMessage(null);
      }

      try {
        const result = await task();

        if (options.successMessage) {
          setMessage(options.successMessage);
        }

        await options.onSuccess?.(result);
        return result;
      } catch (error) {
        handleSessionActionError(error, {
          description: options.sessionExpiredDescription || 'Your session is no longer active. Start a new session to continue.',
          contextLabel,
        });

        if (!options.suppressErrorMessage) {
          setMessage(getActionErrorMessage(error, options.errorMessage || 'Request failed.'));
        }

        await options.onError?.(error);
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    [contextLabel]
  );

  return {
    isRunning,
    message,
    setMessage,
    clearMessage,
    run,
  };
}