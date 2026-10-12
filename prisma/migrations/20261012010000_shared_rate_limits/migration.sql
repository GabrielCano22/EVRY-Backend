-- Additive expansion. Existing readers and all user tables stay untouched.
CREATE TABLE "RateLimitBucket" (
    "key" CHAR(64) NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "RateLimitBucket_count_positive" CHECK ("count" > 0)
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
