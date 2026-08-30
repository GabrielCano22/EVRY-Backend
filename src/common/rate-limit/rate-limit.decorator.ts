import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'evry:rate-limit';

export interface RateLimitOptions {
  limit: number;
  ttlMs: number;
}

export function RateLimit(limit: number, ttlMs = 60_000) {
  return SetMetadata(RATE_LIMIT_METADATA, { limit, ttlMs } satisfies RateLimitOptions);
}
