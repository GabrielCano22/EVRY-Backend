import type { INestApplication } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { jest as jestGlobals } from '@jest/globals';
import request from 'supertest';
import { createIntegrationApp } from './helpers/create-integration-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { RateLimitStore } from '../src/common/rate-limit/rate-limit.store';

describe('shared authentication quota across independent applications', () => {
  const peer = () => `2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g)!.join(':')}`;
  const body = { email: 'shared-quota-missing@example.test', password: 'valid-password' };
  const apps: INestApplication[] = [];
  let first: INestApplication;
  let second: INestApplication;
  let clientAddress: string;

  beforeAll(async () => {
    clientAddress = peer();
    first = await createIntegrationApp(clientAddress);
    second = await createIntegrationApp(clientAddress);
    apps.push(first, second);
  }, 30_000);

  afterAll(async () => { await Promise.all(apps.map(app => app.close())); });

  it('allows only five concurrent login attempts across two applications and cannot bypass with forwarded IPs', async () => {
    const origin = process.env.CORS_ORIGIN!;
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      request((index % 2 ? first : second).getHttpServer())
        .post('/api/v1/auth/login').set('Origin', origin)
        .set('X-Forwarded-For', `198.51.100.${index + 1}`)
        .send(body),
    ));
    expect(results.filter(result => result.status === 401)).toHaveLength(5);
    expect(results.filter(result => result.status === 429)).toHaveLength(7);
    for (const result of results.filter(result => result.status === 429)) {
      expect(result.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
      expect(Number(result.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number(result.headers['retry-after'])).toBeLessThanOrEqual(60);
    }
    const otherClient = await createIntegrationApp(peer());
    apps.push(otherClient);
    await request(otherClient.getHttpServer()).post('/api/v1/auth/login')
      .set('Origin', origin).send(body).expect(401);
  }, 30_000);

  it('does not restore the exhausted login quota when an application restarts', async () => {
    const restarted = await createIntegrationApp(clientAddress);
    apps.push(restarted);
    const response = await request(restarted.getHttpServer()).post('/api/v1/auth/login')
      .set('Origin', process.env.CORS_ORIGIN!).send(body).expect(429);
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('uses database time despite a fast application clock and bounds repeated denied attempts', async () => {
    const identity = `clock-skew:${randomUUID()}`;
    const options = { limit: 3, ttlMs: 60_000 };
    const store = first.get(RateLimitStore);
    for (let index = 0; index < 3; index++) expect((await store.consume(identity, options)).allowed).toBe(true);
    const clock = jestGlobals.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
    try {
      const results = await Promise.all(Array.from({ length: 20 }, () => second.get(RateLimitStore).consume(identity, options)));
      expect(results.every(result => !result.allowed)).toBe(true);
      expect(results.every(result => result.retryAfter >= 1 && result.retryAfter <= 60)).toBe(true);
    } finally { clock.mockRestore(); }
    const key = createHash('sha256').update(identity).digest('hex');
    const [bucket] = await first.get(PrismaService).$queryRaw<Array<{ key: string; count: number }>>`
      SELECT "key", "count" FROM "RateLimitBucket" WHERE "key" = ${key}
    `;
    expect(bucket).toEqual({ key, count: 4 });
    expect(bucket.key).not.toContain(identity);
  });

  it('starts a new window after expiry and housekeeping does not remove an active quota', async () => {
    const prisma = first.get(PrismaService);
    const identity = `expired-quota:${randomUUID()}`;
    const key = createHash('sha256').update(identity).digest('hex');
    const options = { limit: 2, ttlMs: 60_000 };
    const store = first.get(RateLimitStore);
    await store.consume(identity, options);
    await store.consume(identity, options);
    expect((await store.consume(identity, options)).allowed).toBe(false);
    expect(await prisma.$executeRaw`
      UPDATE "RateLimitBucket" SET "resetAt" = statement_timestamp() - interval '1 second' WHERE "key" = ${key}
    `).toBe(1);
    expect((await second.get(RateLimitStore).consume(identity, options)).allowed).toBe(true);
    const freshStore = new RateLimitStore(prisma);
    expect((await freshStore.consume(identity, options)).allowed).toBe(true);
    expect((await store.consume(identity, options)).allowed).toBe(false);
  });

  it('fails closed when quota storage fails but liveness does not depend on that database operation', async () => {
    const failingQuery = jestGlobals.spyOn(first.get(PrismaService), '$queryRaw')
      .mockRejectedValue(new Error('synthetic sensitive database detail'));
    try {
      await request(first.getHttpServer()).get('/api/v1/health/live').expect(200);
      const response = await request(first.getHttpServer()).post('/api/v1/auth/login')
        .set('Origin', process.env.CORS_ORIGIN!).send(body).expect(503);
      expect(response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
      expect(JSON.stringify(response.body)).not.toContain('synthetic sensitive database detail');
    } finally { failingQuery.mockRestore(); }
  });

  it('reclaims expired buckets without reclaiming an exhausted active bucket', async () => {
    const prisma = first.get(PrismaService);
    const activeIdentity = `active-cleanup:${randomUUID()}`;
    const activeKey = createHash('sha256').update(activeIdentity).digest('hex');
    const expiredKey = createHash('sha256').update(`expired-cleanup:${randomUUID()}`).digest('hex');
    const store = first.get(RateLimitStore);
    const options = { limit: 1, ttlMs: 60_000 };
    await store.consume(activeIdentity, options);
    expect((await store.consume(activeIdentity, options)).allowed).toBe(false);
    await prisma.$executeRaw`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${expiredKey}, 1, statement_timestamp() - interval '1 second')
    `;
    await new RateLimitStore(prisma).consume(`cleanup-trigger:${randomUUID()}`, options);
    const remaining = await prisma.$queryRaw<Array<{ key: string }>>`
      SELECT "key" FROM "RateLimitBucket" WHERE "key" IN (${activeKey}, ${expiredKey})
    `;
    expect(remaining).toEqual([{ key: activeKey }]);
    expect((await second.get(RateLimitStore).consume(activeIdentity, options)).allowed).toBe(false);
  });
});
