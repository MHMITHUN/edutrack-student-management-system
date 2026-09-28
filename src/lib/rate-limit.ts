/**
 * Fixed-window in-memory rate limiter.
 *
 * Counters live in a Map stored on globalThis so the limit survives Next.js
 * dev-server HMR (a plain module-level Map would be re-created on every
 * module re-evaluation). On serverless hosting each function instance keeps
 * its own counters — the limit is per-instance, not global across lambdas;
 * see "Known Limitations" in the README.
 */

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window resets (0 when ok). */
  retryAfterSec: number;
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __edutrackRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const buckets: Map<string, RateLimitBucket> =
  (globalForRateLimit.__edutrackRateLimitBuckets ??= new Map());

/** Drop expired buckets so sprayed unique keys cannot grow the map forever. */
function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Count one attempt for `key` and report whether it is allowed.
 * The first attempt in a window opens it; once `max` attempts are counted
 * inside the window, further attempts are refused until it expires.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 500) pruneExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Test-only: wipe all counters so each unit test starts from a clean slate. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
