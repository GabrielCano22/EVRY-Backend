import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { todayCivilDate } from '../src/common/dates/civil-date';
import { PrismaService } from '../src/prisma/prisma.service';
import { createIntegrationApp } from './helpers/create-integration-app';

describe('daily context HTTP/PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await createIntegrationApp();
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({ data: {
      email: `daily-context-${randomUUID()}@example.test`, name: 'Daily context fixture',
      passwordHash: 'synthetic', biologicalSex: 'MALE', trackCycle: true,
    } });
    userId = user.id;
    token = new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).sign({ sub: userId });
  });

  afterAll(async () => {
    try { if (userId) await prisma.user.delete({ where: { id: userId } }); }
    finally { if (app) await app.close(); }
  });

  it.each(['/readiness/latest', '/cycle/today'])('serializes absent %s as explicit JSON null, not an empty success', async (path) => {
    await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
    const response = await request(app.getHttpServer()).get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.text).toBe('null');
    expect(response.body).toBeNull();
  });

  it('upserts daily readiness and reads the exact canonical score without duplicating the civil day', async () => {
    const save = (sleepHrs: number) => request(app.getHttpServer()).post('/api/v1/readiness/checkin')
      .set('Authorization', `Bearer ${token}`).send({ sleepHrs, stress: 1, soreness: 1, motivation: 5 }).expect(201);
    const first = await save(8);
    const updated = await save(4);
    expect(first.body.score).toBe(100);
    expect(updated.body).toMatchObject({ id: first.body.id, sleepHrs: 4, score: 80 });
    expect(updated.body.civilDate).toBe(`${todayCivilDate()}T00:00:00.000Z`);
    const latest = await request(app.getHttpServer()).get('/api/v1/readiness/latest')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(latest.body).toEqual(updated.body);
    expect(await prisma.readiness.count({ where: { userId } })).toBe(1);
  });

  it('scores partial readiness updates from the actual preserved daily inputs', async () => {
    const save = (body: Record<string, number>) => request(app.getHttpServer()).post('/api/v1/readiness/checkin')
      .set('Authorization', `Bearer ${token}`).send(body).expect(201);
    const first = await save({ sleepHrs: 0, stress: 5, soreness: 5, motivation: 1 });
    expect(first.body.score).toBe(0);
    const updated = await save({ motivation: 5 });
    expect(updated.body).toMatchObject({
      id: first.body.id, sleepHrs: 0, stress: 5, soreness: 5, motivation: 5, score: 20,
    });
    const latest = await request(app.getHttpServer()).get('/api/v1/readiness/latest')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(latest.body).toEqual(updated.body);
    expect(await prisma.readiness.count({ where: { userId } })).toBe(1);
  });

  it('clears explicit null readiness answers while preserving the canonical daily row', async () => {
    const save = (body: Record<string, number | null>) => request(app.getHttpServer()).post('/api/v1/readiness/checkin')
      .set('Authorization', `Bearer ${token}`).send(body).expect(201);
    const first = await save({ sleepHrs: 8, stress: 1, soreness: 1, motivation: 5 });
    expect(first.body.score).toBe(100);
    const cleared = await save({ sleepHrs: null, stress: null, soreness: null, motivation: null });
    expect(cleared.body).toMatchObject({
      id: first.body.id, sleepHrs: null, stress: null, soreness: null, motivation: null, score: 70,
    });
    await expect(prisma.readiness.findUniqueOrThrow({ where: { id: first.body.id } }))
      .resolves.toMatchObject({ sleepHrs: null, stress: null, soreness: null, motivation: null, score: 70 });
  });
});
