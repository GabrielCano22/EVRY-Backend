import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'evry:rate-limit';
export const SKIP_RATE_LIMIT_METADATA = 'evry:skip-rate-limit';

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_METADATA, true);

export interface RateLimitOptions {
  limit: number;
  ttlMs: number;
}

export function RateLimit(limit: number, ttlMs = 60_000) {
  return SetMetadata(RATE_LIMIT_METADATA, { limit, ttlMs } satisfies RateLimitOptions);
}
