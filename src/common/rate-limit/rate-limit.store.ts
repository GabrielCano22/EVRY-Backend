import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { RateLimitOptions } from './rate-limit.decorator';

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

@Injectable()
export class RateLimitStore {
  private nextCleanupAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async consume(identity: string, options: RateLimitOptions): Promise<RateLimitResult> {
    // This local clock schedules housekeeping only. Quota/reset decisions use DB time.
    const now = Date.now();
    if (now >= this.nextCleanupAt) {
      this.nextCleanupAt = now + 60_000;
      await this.prisma.$executeRaw`
        DELETE FROM "RateLimitBucket" WHERE "key" IN (
          SELECT "key" FROM "RateLimitBucket"
          WHERE "resetAt" <= statement_timestamp()
          ORDER BY "resetAt", "key" LIMIT 1000 FOR UPDATE SKIP LOCKED
        ) AND "resetAt" <= statement_timestamp()
      `;
    }
    const key = createHash('sha256').update(identity).digest('hex');
    const [result] = await this.prisma.$queryRaw<Array<{ count: number; retryAfter: number }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, statement_timestamp() + ${options.ttlMs}::integer * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= statement_timestamp() THEN 1
          ELSE LEAST("RateLimitBucket"."count" + 1, ${options.limit + 1}::integer)
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= statement_timestamp() THEN EXCLUDED."resetAt"
          ELSE "RateLimitBucket"."resetAt"
        END
      RETURNING "count",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - statement_timestamp()))))::integer AS "retryAfter"
    `;
    if (!result) throw new Error('Rate limit storage returned no quota');
    return { allowed: result.count <= options.limit, retryAfter: result.retryAfter };
  }
}
