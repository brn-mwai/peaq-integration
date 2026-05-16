import { z } from "zod";

// Idempotency cache. Wraps an extrinsic submission so that the same logical
// operation (keyed by caller-provided idempotencyKey) does not double-submit
// across retries, restarts, or concurrent callers.
//
// Two adapters: in-memory (default; lost on process restart) and store-backed
// (consumer provides a Storage implementation that survives restart).
//
// In-flight de-duplication: if the same key is submitted twice concurrently,
// the second caller awaits the first one's promise instead of starting a new
// extrinsic. After completion, the receipt is cached for `ttlMs` so that
// retried invocations within the TTL return the same receipt.
//
// **Caller responsibility:** generate idempotency keys deterministically from
// the operation's INPUT identity (e.g., `anchor.${workspaceId}.${anchorDate}`),
// not from the timestamp. A non-deterministic key defeats the cache.

export interface IdempotencyEntry<T> {
  status: "in-flight" | "completed" | "failed";
  receipt?: T;
  error?: string;
  completedAt?: number;
}

export interface IdempotencyStore<T> {
  get(key: string): Promise<IdempotencyEntry<T> | null>;
  set(key: string, entry: IdempotencyEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
}

export class InMemoryIdempotencyStore<T> implements IdempotencyStore<T> {
  private readonly entries = new Map<string, IdempotencyEntry<T>>();

  async get(key: string): Promise<IdempotencyEntry<T> | null> {
    return this.entries.get(key) ?? null;
  }
  async set(key: string, entry: IdempotencyEntry<T>): Promise<void> {
    this.entries.set(key, entry);
  }
  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
  size(): number {
    return this.entries.size;
  }
}

export const idempotencyKeySchema = z
  .string()
  .min(8, "Idempotency key must be at least 8 chars")
  .max(255, "Idempotency key max 255 chars")
  .regex(/^[a-zA-Z0-9._-]+$/, "Idempotency key must be url-safe");

export interface IdempotencyOptions {
  ttlMs?: number;
  staleAfterMs?: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60_000;
const DEFAULT_STALE_MS = 5 * 60_000;

export class IdempotencyCache<T> {
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly ttlMs: number;
  private readonly staleAfterMs: number;

  constructor(
    private readonly store: IdempotencyStore<T>,
    opts: IdempotencyOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_MS;
  }

  async getOrCompute(
    rawKey: string,
    fn: () => Promise<T>,
  ): Promise<{ receipt: T; cached: boolean }> {
    const key = idempotencyKeySchema.parse(rawKey);

    const existing = await this.store.get(key);
    if (existing?.status === "completed" && existing.receipt !== undefined) {
      const age = Date.now() - (existing.completedAt ?? 0);
      if (age <= this.ttlMs) {
        return { receipt: existing.receipt, cached: true };
      }
    }

    const inFlight = this.inFlight.get(key);
    if (inFlight) {
      const receipt = await inFlight;
      return { receipt, cached: true };
    }

    if (existing?.status === "in-flight") {
      const age = Date.now() - (existing.completedAt ?? 0);
      if (age < this.staleAfterMs) {
        throw new Error(
          `Idempotency key ${key} is in-flight in another process (age ${age}ms < stale-after ${this.staleAfterMs}ms)`,
        );
      }
    }

    await this.store.set(key, { status: "in-flight", completedAt: Date.now() });
    const promise = (async () => {
      try {
        const receipt = await fn();
        await this.store.set(key, { status: "completed", receipt, completedAt: Date.now() });
        return receipt;
      } catch (err) {
        await this.store.set(key, {
          status: "failed",
          error: (err as Error).message,
          completedAt: Date.now(),
        });
        throw err;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    const receipt = await promise;
    return { receipt, cached: false };
  }

  async invalidate(rawKey: string): Promise<void> {
    const key = idempotencyKeySchema.parse(rawKey);
    await this.store.delete(key);
    this.inFlight.delete(key);
  }
}

export function makeAnchorIdempotencyKey(workspaceId: string, anchorDate: string): string {
  return `anchor.${workspaceId}.${anchorDate}`;
}

export function makeDidIdempotencyKey(did: string, attributeName: string): string {
  return `did.${did.replace(/[^a-zA-Z0-9._-]/g, "_")}.${attributeName}`;
}

export function makeStorageIdempotencyKey(itemType: string): string {
  return `storage.${itemType.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
