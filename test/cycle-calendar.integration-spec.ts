import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('cycle calendar HTTP/PostgreSQL', () => {
  const prefix = `calendar-${randomUUID()}`;
  const users: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string;
  let other: string;
  let optedOut: string;

  function get(query: string, actor = owner) {
    const token = new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).sign({ sub: actor });
    return request(app.getHttpServer()).get(`/api/v1/cycle/calendar${query}`).set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    for (const [index, trackCycle] of [true, true, false].entries()) {
      const user = await prisma.user.create({ data: {
        email: `${prefix}-${index}@example.test`, name: `${prefix}-${index}`,
        passwordHash: 'synthetic', biologicalSex: 'MALE', trackCycle,
      } });
      users.push(user.id);
    }
    [owner, other, optedOut] = users;
    await prisma.cycleEntry.createMany({ data: [
      { userId: owner, date: new Date('2025-06-01'), isPeriodStart: true },
      ...Array.from({ length: 190 }, (_, index) => ({
        userId: owner, date: new Date(Date.UTC(2025, 5, 2 + index)), isPeriodStart: false,
      })),
      { userId: owner, date: new Date('2025-12-31'), isPeriodStart: false },
      { userId: owner, date: new Date('2026-01-01'), isPeriodStart: true },
      { userId: owner, date: new Date('2026-01-31'), isPeriodStart: false },
      { userId: owner, date: new Date('2026-02-01'), isPeriodStart: true },
      { userId: owner, date: new Date('2099-01-01'), isPeriodStart: true },
      { userId: other, date: new Date('2025-12-31'), isPeriodStart: true },
      { userId: other, date: new Date('2026-01-15'), isPeriodStart: true },
    ] });
  });

  afterAll(async () => {
    try {
      if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      if (app) await app.close();
    }
  });

  it('keeps an old seed beyond 180 newer records and includes only owned month-boundary labels', async () => {
    const cycle = await get('?from=2026-01-01&to=2026-01-31');
    expect(cycle.status).toBe(200);
    expect(cycle.body).toMatchObject({ from: '2026-01-01', to: '2026-01-31', previousPeriodStart: '2025-06-01' });
    expect(cycle.body.entries.map((entry: { date: string }) => entry.date)).toEqual([
      '2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z',
    ]);
    expect(cycle.body.entries.every((entry: { userId: string }) => entry.userId === owner)).toBe(true);
    const scoped = await get('?from=2026-01-01&to=2026-01-31', other);
    expect(scoped.body.previousPeriodStart).toBe('2025-12-31');
    expect(scoped.body.entries).toHaveLength(1);
  });

  it('allows future projection windows but excludes future records and future seeds', async () => {
    const future = await get('?from=2099-01-01&to=2099-01-31');
    expect(future.status).toBe(200);
    expect(future.body).toMatchObject({ entries: [], previousPeriodStart: '2026-02-01' });
    const afterFuture = await get('?from=2099-02-01&to=2099-02-28');
    expect(afterFuture.status).toBe(200);
    expect(afterFuture.body).toMatchObject({ entries: [], previousPeriodStart: '2026-02-01' });
    const beforeHistory = await get('?from=2025-01-01&to=2025-01-31');
    expect(beforeHistory.body).toMatchObject({ entries: [], previousPeriodStart: null });
  });

  it('requires authentication and explicit opt-in regardless of sex', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/cycle/calendar?from=2026-01-01&to=2026-01-31')).status).toBe(401);
    const rejected = await get('?from=2026-01-01&to=2026-01-31', optedOut);
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toContain('voluntariamente');
  });

  it.each([
    '', '?from=2026-01-01', '?to=2026-01-31',
    '?from=2026-02-29&to=2026-03-01', '?from=2026-1-01&to=2026-01-31',
    '?from=2026-01-02&to=2026-01-01', '?from=2026-01-01&to=2026-03-04',
    '?from=2026-01-01&to=2026-01-31&extra=true',
    '?from=2026-01-01&from=2026-01-02&to=2026-01-31',
  ])('rejects missing, malformed, reversed or oversized query %s', async (query) => {
    expect((await get(query)).status).toBe(400);
  });

  it('accepts exactly 62 inclusive civil days', async () => {
    expect((await get('?from=2026-01-01&to=2026-03-03')).status).toBe(200);
  });
});
