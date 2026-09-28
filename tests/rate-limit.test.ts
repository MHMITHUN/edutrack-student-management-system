import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimit, resetRateLimitsForTests } from "@/lib/rate-limit";

/**
 * Unit tests for the fixed-window rate limiter: allow-then-block inside a
 * window, the reported retry seconds, window reset, and per-key isolation.
 * Fake timers control Date.now() so no real waiting is needed.
 */

const T0 = new Date("2026-09-28T10:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  resetRateLimitsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit — fixed window", () => {
  it("allows up to max attempts in a window, then blocks", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit("k", 5, 60_000)).toEqual({ ok: true, retryAfterSec: 0 });
    }
    const blocked = rateLimit("k", 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("reports the seconds remaining until the window resets", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("k", 3, 10 * 60_000);
    vi.setSystemTime(T0 + 4 * 60_000); // 4 minutes into a 10-minute window
    const blocked = rateLimit("k", 3, 10 * 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(6 * 60);
  });

  it("opens a fresh window after the previous one expires", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("k", 3, 60_000);
    expect(rateLimit("k", 3, 60_000).ok).toBe(false);
    vi.setSystemTime(T0 + 60_001);
    expect(rateLimit("k", 3, 60_000)).toEqual({ ok: true, retryAfterSec: 0 });
  });

  it("tracks keys independently", () => {
    rateLimit("a", 2, 60_000);
    rateLimit("a", 2, 60_000);
    expect(rateLimit("a", 2, 60_000).ok).toBe(false);
    expect(rateLimit("b", 2, 60_000).ok).toBe(true);
  });
});
