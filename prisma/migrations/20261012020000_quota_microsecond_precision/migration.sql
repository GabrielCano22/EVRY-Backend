-- Preserve every existing expiry and counter. New windows retain DB microseconds;
-- millisecond rounding can otherwise extend a 60s window and report Retry-After 61.
ALTER TABLE "RateLimitBucket" ALTER COLUMN "resetAt" TYPE TIMESTAMPTZ(6);
