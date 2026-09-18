export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Hard cap on tracked client keys so the map cannot grow without bound. */
  maxBuckets?: number;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until the current window resets; used for `Retry-After`. */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
  size(): number;
}

const DEFAULT_MAX_BUCKETS = 10_000;

/**
 * Fixed-window per-key rate limiter that opportunistically evicts expired buckets
 * and caps the tracked-key map so a stream of spoofed client keys cannot exhaust memory.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const limit = Math.max(1, Math.trunc(options.limit));
  const windowMs = Math.max(1, Math.trunc(options.windowMs));
  const maxBuckets = Math.max(1, Math.trunc(options.maxBuckets ?? DEFAULT_MAX_BUCKETS));
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { startedAt: number; count: number }>();

  const pruneExpired = (current: number): void => {
    for (const [key, bucket] of buckets) {
      if (current - bucket.startedAt >= windowMs) buckets.delete(key);
    }
  };

  const capBuckets = (): void => {
    if (buckets.size <= maxBuckets) return;
    const oldestFirst = [...buckets.entries()].sort((left, right) => left[1].startedAt - right[1].startedAt);
    const excess = buckets.size - maxBuckets;
    for (let index = 0; index < excess; index += 1) {
      const entry = oldestFirst[index];
      if (entry !== undefined) buckets.delete(entry[0]);
    }
  };

  return {
    check(key) {
      const current = now();
      pruneExpired(current);
      const existing = buckets.get(key);
      if (existing === undefined || current - existing.startedAt >= windowMs) {
        buckets.set(key, { startedAt: current, count: 1 });
        capBuckets();
        return { allowed: true, retryAfterMs: 0 };
      }
      existing.count += 1;
      if (existing.count > limit) {
        return { allowed: false, retryAfterMs: Math.max(0, existing.startedAt + windowMs - current) };
      }
      return { allowed: true, retryAfterMs: 0 };
    },
    size() {
      return buckets.size;
    },
  };
}
