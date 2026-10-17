import type { RateLimitOptions } from '../../src/common/rate-limit/rate-limit.decorator';

// Unit-only replacement for the external quota storage. Real concurrency is
// covered against PostgreSQL by rate-limit.integration-spec.ts.
export function memoryRateLimitStore() {
  const entries = new Map<string, { count: number; resetAt: number }>();
  return {
    async consume(identity: string, { limit, ttlMs }: RateLimitOptions) {
      const now = Date.now();
      const previous = entries.get(identity);
      const entry = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + ttlMs } : previous;
      const allowed = entry.count < limit;
      if (allowed) entry.count++;
      entries.set(identity, entry);
      return { allowed, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    },
  };
}
