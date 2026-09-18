import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/rate-limit.js";

describe("verifier rate limiter", () => {
  it("allows within the window and reports retry-after once the limit is exceeded", () => {
    let now = 1_000;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });

    expect(limiter.check("a")).toMatchObject({ allowed: true });
    expect(limiter.check("a")).toMatchObject({ allowed: true });
    expect(limiter.check("a")).toMatchObject({ allowed: false, retryAfterMs: 1_000 });
    now = 1_500;
    expect(limiter.check("a")).toMatchObject({ allowed: false, retryAfterMs: 500 });
    now = 2_000;
    expect(limiter.check("a")).toMatchObject({ allowed: true });
  });

  it("evicts expired buckets and caps the tracked-key map", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 100, maxBuckets: 2, now: () => now });

    limiter.check("a");
    limiter.check("b");
    expect(limiter.size()).toBe(2);

    limiter.check("c");
    expect(limiter.size()).toBeLessThanOrEqual(2);

    now = 1_000;
    limiter.check("d");
    expect(limiter.size()).toBe(1);
  });
});
