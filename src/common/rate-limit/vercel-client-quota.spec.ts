import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RateLimit } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';
import { memoryRateLimitStore } from '../../../test/helpers/memory-rate-limit-store';

@Controller('quota')
class QuotaController {
  @Get()
  @RateLimit(2, 60_000)
  read() { return { ok: true }; }
}

describe('platform-specific client quota identity', () => {
  let app: INestApplication;
  let savedVercel: string | undefined;

  beforeEach(async () => {
    savedVercel = process.env.VERCEL;
    delete process.env.VERCEL;
    const module = await Test.createTestingModule({
      controllers: [QuotaController],
      providers: [RateLimitGuard, { provide: RateLimitStore, useValue: memoryRateLimitStore() }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards(module.get(RateLimitGuard));
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    if (savedVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = savedVercel;
  });

  it('isolates Vercel clients behind the same socket and ignores other forwarded headers', async () => {
    process.env.VERCEL = '1';
    for (let attempt = 0; attempt < 2; attempt++) {
      await request(app.getHttpServer()).get('/quota')
        .set('X-Vercel-Forwarded-For', '198.51.100.20')
        .set('X-Forwarded-For', `203.0.113.${attempt + 1}`).expect(200);
    }
    await request(app.getHttpServer()).get('/quota')
      .set('X-Vercel-Forwarded-For', '198.51.100.20')
      .set('X-Forwarded-For', '203.0.113.99').expect(429);
    await request(app.getHttpServer()).get('/quota')
      .set('X-Vercel-Forwarded-For', '198.51.100.21').expect(200);
  });

  it('uses one quota for equivalent IPv6 representations', async () => {
    process.env.VERCEL = '1';
    for (const address of ['2001:DB8:0:0:0:0:0:1', '2001:db8::1']) {
      await request(app.getHttpServer()).get('/quota')
        .set('X-Vercel-Forwarded-For', address).expect(200);
    }
    await request(app.getHttpServer()).get('/quota')
      .set('X-Vercel-Forwarded-For', '2001:db8::1').expect(429);
  });

  it('uses one quota for equivalent IPv4-mapped IPv6 representations', async () => {
    process.env.VERCEL = '1';
    for (const address of ['::ffff:198.51.100.20', '0:0:0:0:0:FFFF:C633:6414']) {
      await request(app.getHttpServer()).get('/quota')
        .set('X-Vercel-Forwarded-For', address).expect(200);
    }
    await request(app.getHttpServer()).get('/quota')
      .set('X-Vercel-Forwarded-For', '::ffff:c633:6414').expect(429);
  });

  it('rejects duplicate platform identity headers', async () => {
    process.env.VERCEL = '1';
    await request(app.getHttpServer()).get('/quota')
      .set({ 'X-Vercel-Forwarded-For': ['198.51.100.20', '198.51.100.21'] }).expect(503);
  });

  it.each([undefined, '', 'not-an-ip', '198.51.100.20, 198.51.100.21',
    '198.51.100.20:443', 'fe80::1%eth0', 'a'.repeat(100),
    '[2001:db8::1]', '[2001:db8::1]:443'])(
    'fails closed for an absent or malformed platform identity: %s', async address => {
      process.env.VERCEL = '1';
      const call = request(app.getHttpServer()).get('/quota')
        .set('X-Forwarded-For', '198.51.100.20');
      if (address !== undefined) call.set('X-Vercel-Forwarded-For', address);
      await call.expect(503);
    },
  );

  it.each([undefined, '0', 'true'])(
    'does not trust client-supplied platform headers outside Vercel (%s)', async platform => {
      if (platform !== undefined) process.env.VERCEL = platform;
      for (let attempt = 0; attempt < 2; attempt++) {
        await request(app.getHttpServer()).get('/quota')
          .set('X-Vercel-Forwarded-For', `198.51.100.${attempt + 1}`)
          .set('X-Forwarded-For', `203.0.113.${attempt + 1}`).expect(200);
      }
      await request(app.getHttpServer()).get('/quota')
        .set('X-Vercel-Forwarded-For', '198.51.100.99').expect(429);
    },
  );
});
