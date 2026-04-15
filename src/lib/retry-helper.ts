export async function retryable<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 200,
    onRetry,
  }: {
    maxAttempts?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, err: unknown) => void;
  } = {},
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;

      const transient =
        error instanceof Error &&
        ((error as NodeJS.ErrnoException).code?.startsWith('E') ||
          (error as Error & { status?: number }).status === 429 ||
          (((error as Error & { status?: number }).status || 0) >= 500 &&
            ((error as Error & { status?: number }).status || 0) < 600));

      if (!transient || attempt >= maxAttempts) {
        throw error;
      }

      onRetry?.(attempt, error);
      const jitter = Math.random() * 0.2 * baseDelayMs;
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}