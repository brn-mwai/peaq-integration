import { describe, expect, it, vi } from "vitest";
import { retryWithBackoff } from "../src/chain/retry.js";

describe("retryWithBackoff", () => {
  it("returns ok=true on first success", async () => {
    const fn = vi.fn().mockResolvedValueOnce("ok");
    const r = await retryWithBackoff(fn, { maxAttempts: 3, baseMs: 1, maxMs: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("ok");
    expect(r.attempts).toBe(1);
  });

  it("retries on retryable timeout error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout while waiting"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("ok-after-retries");
    const r = await retryWithBackoff(fn, { maxAttempts: 5, baseMs: 1, maxMs: 5, jitter: false });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
  });

  it("does NOT retry on permanent errors (insufficient balance)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("balance too low to pay fees"));
    const r = await retryWithBackoff(fn, { maxAttempts: 5, baseMs: 1, maxMs: 5, jitter: false });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(1);
  });

  it("respects custom shouldRetry predicate", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("custom"));
    const r = await retryWithBackoff(fn, {
      maxAttempts: 3,
      baseMs: 1,
      maxMs: 5,
      jitter: false,
      shouldRetry: (err) => (err as Error).message === "custom",
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3);
  });
});
