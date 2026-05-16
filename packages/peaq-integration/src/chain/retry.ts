export interface RetryOptions {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
  jitter?: boolean;
  shouldRetry?: (err: unknown) => boolean;
}

export type RetryOutcome<T> =
  | { ok: true; value: T; attempts: number; durationMs: number }
  | { ok: false; error: unknown; attempts: number; durationMs: number };

const DEFAULT_RETRYABLE = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("enetunreach"))
    return true;
  if (msg.includes("rate limit") || msg.includes("too many requests")) return true;
  if (msg.includes("disconnected") || msg.includes("connection")) return true;
  if (msg.includes("priority is too low") || msg.includes("invalid transaction")) return false;
  if (msg.includes("balance too low") || msg.includes("insufficient")) return false;
  return false;
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<RetryOutcome<T>> {
  const startMs = Date.now();
  let lastError: unknown;
  let attempts = 0;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_RETRYABLE;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    attempts = attempt;
    try {
      const value = await fn();
      return { ok: true, value, attempts, durationMs: Date.now() - startMs };
    } catch (err) {
      lastError = err;
      if (attempt >= opts.maxAttempts) break;
      if (!shouldRetry(err)) break;
      const exp = opts.baseMs * 2 ** (attempt - 1);
      const capped = Math.min(exp, opts.maxMs);
      const jitter = opts.jitter !== false ? capped * (0.5 + Math.random() * 0.5) : capped;
      await new Promise((r) => setTimeout(r, jitter));
    }
  }

  return { ok: false, error: lastError, attempts, durationMs: Date.now() - startMs };
}
