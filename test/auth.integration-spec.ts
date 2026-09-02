import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createIntegrationApp } from './helpers/create-integration-app';

type HttpResponse = {
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  status: number;
};

const PASSWORD = 'valid-password';

function allowedOrigin(): string {
  const origin = process.env.CORS_ORIGIN;
  if (!origin) throw new Error('CORS_ORIGIN must be configured for this integration test.');
  return origin;
}

function firstSetCookie(response: HttpResponse): string {
  const header = response.headers['set-cookie'];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) throw new Error('Expected a Set-Cookie header.');
  return cookie;
}

function refreshTokenFrom(response: HttpResponse): string {
  const match = firstSetCookie(response).match(/(?:^|;)\s*evry_refresh=([^;]+)/);
  if (!match?.[1]) throw new Error('Expected an evry_refresh cookie.');
  return decodeURIComponent(match[1]);
}

function refreshCookiePair(response: HttpResponse): string {
  return firstSetCookie(response).split(';', 1)[0];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('authentication HTTP/PostgreSQL', () => {
  const prefix = `ai-${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${label}@example.test`,
        name: `${prefix}-${label}`,
        passwordHash: await bcrypt.hash(PASSWORD, 12),
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function mobileLogin(
    email: string,
    targetApp: INestApplication = app,
  ): Promise<HttpResponse> {
    return request(targetApp.getHttpServer())
      .post('/api/v1/auth/mobile/login')
      .send({ email, password: PASSWORD });
  }

  async function mobileRefresh(
    refreshToken: string,
    targetApp: INestApplication = app,
  ): Promise<HttpResponse> {
    return request(targetApp.getHttpServer())
      .post('/api/v1/auth/mobile/refresh')
      .send({ refreshToken });
  }

  beforeAll(async () => {
    app = await createIntegrationApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    let cleanupFailure: unknown;
    try {
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } catch (error) {
      cleanupFailure = error;
    } finally {
      await app?.close();
    }
    if (cleanupFailure) throw cleanupFailure;
  });

  it('uses the production HTTP pipeline for versioning, strict browser origin and uniform errors', async () => {
    const server = app.getHttpServer();
    const email = `${prefix}-pipeline@example.test`;
    const payload = { email, password: PASSWORD, name: 'Pipeline User' };

    await request(server)
      .get('/')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ estado: 'ok', api: '/api/v1' });
      });

    const rejected = await request(server)
      .post('/api/auth/register')
      .send(payload)
      .expect(403);

    expect(rejected.body).toEqual({
      code: 'FORBIDDEN',
      message: 'El origen de la solicitud no está permitido.',
      retryable: false,
      requestId: expect.any(String),
    });
    await expect(prisma.user.findUnique({ where: { email } })).resolves.toBeNull();

    const accepted = await request(server)
      .post('/api/v1/auth/register')
      .set('Origin', process.env.CORS_ORIGIN as string)
      .send(payload)
      .expect(201);

    expect(accepted.body).toEqual({ accessToken: expect.any(String) });
    const cookie = firstSetCookie(accepted);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api');
    expect(cookie).not.toContain('Secure');
    expect(accepted.body).not.toHaveProperty('refreshToken');

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
    await expect(bcrypt.compare(PASSWORD, user.passwordHash)).resolves.toBe(true);
    expect(user.passwordHash).not.toBe(PASSWORD);

    const rawRefreshToken = refreshTokenFrom(accepted);
    const storedRefreshToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: sha256(rawRefreshToken) },
    });
    expect(storedRefreshToken).toMatchObject({ userId: user.id, platform: 'WEB' });
    expect(storedRefreshToken.tokenHash).not.toBe(rawRefreshToken);
  });

  it('sets Secure in production and rotates then revokes a browser token family', async () => {
    const user = await createUser('web-rotation');
    const originalNodeEnvironment = process.env.NODE_ENV;
    let login: HttpResponse;
    try {
      process.env.NODE_ENV = 'production';
      login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', allowedOrigin())
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
    } finally {
      process.env.NODE_ENV = originalNodeEnvironment;
    }

    expect(firstSetCookie(login)).toContain('Secure');
    expect(login.body).toEqual({ accessToken: expect.any(String) });
    const originalToken = refreshTokenFrom(login);
    const originalRecord = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: sha256(originalToken) },
    });

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', allowedOrigin())
      .set('Cookie', refreshCookiePair(login))
      .send({})
      .expect(200);

    expect(refreshed.body).toEqual({ accessToken: expect.any(String) });
    expect(refreshed.body).not.toHaveProperty('refreshToken');
    const rotatedToken = refreshTokenFrom(refreshed);
    expect(rotatedToken).not.toBe(originalToken);
    await expect(prisma.refreshToken.findUniqueOrThrow({
      where: { id: originalRecord.id },
    })).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    await expect(prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: sha256(rotatedToken) },
    })).resolves.toMatchObject({
      familyId: originalRecord.familyId,
      platform: 'WEB',
      revokedAt: null,
    });

    const loggedOut = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', allowedOrigin())
      .set('Cookie', refreshCookiePair(refreshed))
      .send({})
      .expect(200);

    expect(loggedOut.body).toEqual({ ok: true });
    expect(firstSetCookie(loggedOut)).toContain('Expires=Thu, 01 Jan 1970');
    expect(firstSetCookie(loggedOut)).toContain('Path=/api');
    const refreshAfterLogout = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', allowedOrigin())
      .set('Cookie', `evry_refresh=${rotatedToken}`)
      .send({});
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('returns mobile tokens only in JSON and supports rotation and logout without cookies', async () => {
    const user = await createUser('mobile-contract');
    const login = await mobileLogin(user.email);

    expect(login.status).toBe(200);
    expect(login.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(login.headers['set-cookie']).toBeUndefined();
    const originalToken = login.body.refreshToken as string;

    const refreshed = await mobileRefresh(originalToken);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(refreshed.headers['set-cookie']).toBeUndefined();
    const rotatedToken = refreshed.body.refreshToken as string;
    expect(rotatedToken).not.toBe(originalToken);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/logout')
      .send({ refreshToken: rotatedToken });
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ ok: true });
    expect((await mobileRefresh(rotatedToken)).status).toBe(401);
  });

  it('rejects platform exchange and revokes only the reused token family', async () => {
    const user = await createUser('family-isolation');
    const isolatedApp = await createIntegrationApp();
    try {
      const webLogin = await request(isolatedApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', allowedOrigin())
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const webToken = refreshTokenFrom(webLogin);

      const exchanged = await mobileRefresh(webToken, isolatedApp);
      expect(exchanged.status).toBe(401);
      expect(exchanged.body).toMatchObject({
        code: 'UNAUTHORIZED',
        retryable: false,
        requestId: expect.any(String),
      });
      const webAfterExchange = await request(isolatedApp.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', allowedOrigin())
        .set('Cookie', `evry_refresh=${webToken}`)
        .send({});
      expect(webAfterExchange.status).toBe(401);

      const firstSession = await mobileLogin(user.email, isolatedApp);
      const independentSession = await mobileLogin(user.email, isolatedApp);
      const firstToken = firstSession.body.refreshToken as string;
      const independentToken = independentSession.body.refreshToken as string;
      const firstRotation = await mobileRefresh(firstToken, isolatedApp);
      expect(firstRotation.status).toBe(200);
      const childToken = firstRotation.body.refreshToken as string;

      expect((await mobileRefresh(firstToken, isolatedApp)).status).toBe(401);
      expect((await mobileRefresh(childToken, isolatedApp)).status).toBe(401);
      expect((await mobileRefresh(independentToken, isolatedApp)).status).toBe(200);

      const webForMobileLogout = await request(isolatedApp.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', allowedOrigin())
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const webLogoutToken = refreshTokenFrom(webForMobileLogout);
      const mobileLogoutExchange = await request(isolatedApp.getHttpServer())
        .post('/api/v1/auth/mobile/logout')
        .send({ refreshToken: webLogoutToken });
      expect(mobileLogoutExchange.status).toBe(401);
      await expect(prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: sha256(webLogoutToken) },
      })).resolves.toMatchObject({ revokedAt: expect.any(Date) });

      const mobileForWebLogout = await mobileLogin(user.email, isolatedApp);
      const mobileLogoutToken = mobileForWebLogout.body.refreshToken as string;
      const webLogoutExchange = await request(isolatedApp.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', allowedOrigin())
        .set('Cookie', `evry_refresh=${mobileLogoutToken}`)
        .send({});
      expect(webLogoutExchange.status).toBe(401);
      expect(firstSetCookie(webLogoutExchange)).toContain('Expires=Thu, 01 Jan 1970');
      await expect(prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: sha256(mobileLogoutToken) },
      })).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    } finally {
      await isolatedApp.close();
    }
  });

  it('never returns 500 for simultaneous refresh and invalidates the winning descendant', async () => {
    const user = await createUser('concurrent-refresh');
    const login = await mobileLogin(user.email);
    const originalToken = login.body.refreshToken as string;

    const [left, right] = await Promise.all([
      mobileRefresh(originalToken),
      mobileRefresh(originalToken),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 401]);
    const winner = left.status === 200 ? left : right;
    const rejected = left.status === 401 ? left : right;
    expect(rejected.body).toMatchObject({
      code: 'UNAUTHORIZED',
      retryable: false,
      requestId: expect.any(String),
    });
    expect((await mobileRefresh(winner.body.refreshToken as string)).status).toBe(401);
  });

  it('requires an exact configured Origin on every browser mutation and its legacy alias', async () => {
    const isolatedApp = await createIntegrationApp();
    const isolatedPrisma = isolatedApp.get(PrismaService);
    const email = `${prefix}-missing-origin@example.test`;
    const payloadByRoute: Array<[string, Record<string, unknown>]> = [
      ['/auth/register', { email, password: PASSWORD, name: 'No Origin' }],
      ['/auth/login', { email, password: PASSWORD }],
      ['/auth/refresh', {}],
      ['/auth/logout', {}],
    ];

    try {
      for (const [suffix, body] of payloadByRoute) {
        for (const prefixPath of ['/api/v1', '/api']) {
          const response = await request(isolatedApp.getHttpServer())
            .post(`${prefixPath}${suffix}`)
            .send(body);
          expect(response.status).toBe(403);
          expect(response.body).toEqual({
            code: 'FORBIDDEN',
            message: 'El origen de la solicitud no está permitido.',
            retryable: false,
            requestId: expect.any(String),
          });
        }
      }
      await expect(isolatedPrisma.user.findUnique({ where: { email } })).resolves.toBeNull();
    } finally {
      await isolatedApp.close();
    }
  });

  it('rejects null, malformed, untrusted and non-canonical browser origins without changes', async () => {
    const isolatedApp = await createIntegrationApp();
    const isolatedPrisma = isolatedApp.get(PrismaService);
    const email = `${prefix}-invalid-origin@example.test`;
    const cases: Array<[string, string, Record<string, unknown>]> = [
      ['/api/v1/auth/register', 'null', { email, password: PASSWORD, name: 'Invalid Origin' }],
      ['/api/v1/auth/login', 'not-a-url', { email, password: PASSWORD }],
      ['/api/v1/auth/refresh', 'https://untrusted.example', {}],
      ['/api/v1/auth/logout', `${allowedOrigin()}/`, {}],
    ];

    try {
      for (const [path, origin, body] of cases) {
        const response = await request(isolatedApp.getHttpServer())
          .post(path)
          .set('Origin', origin)
          .send(body);
        expect(response.status).toBe(403);
      }
      await expect(isolatedPrisma.user.findUnique({ where: { email } })).resolves.toBeNull();
    } finally {
      await isolatedApp.close();
    }
  });

  it('does not add localhost aliases that were not listed in CORS_ORIGIN', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('enforces real register, login and refresh limits with uniform retryable errors', async () => {
    const isolatedApp = await createIntegrationApp();
    const isolatedPrisma = isolatedApp.get(PrismaService);
    const createdIds: string[] = [];
    const server = isolatedApp.getHttpServer();

    try {
      for (let index = 0; index < 3; index += 1) {
        const email = `${prefix}-rate-register-${index}@example.test`;
        const response = await request(server)
          .post('/api/v1/auth/register')
          .set('Origin', allowedOrigin())
          .send({ email, password: PASSWORD, name: `Rate ${index}` });
        expect(response.status).toBe(201);
        const created = await isolatedPrisma.user.findUniqueOrThrow({ where: { email } });
        createdIds.push(created.id);
      }
      const registerLimited = await request(server)
        .post('/api/v1/auth/register')
        .set('Origin', allowedOrigin())
        .send({
          email: `${prefix}-rate-register-blocked@example.test`,
          password: PASSWORD,
          name: 'Rate blocked',
        });
      expect(registerLimited.status).toBe(429);

      for (let index = 0; index < 5; index += 1) {
        const response = await request(server)
          .post('/api/v1/auth/login')
          .set('Origin', allowedOrigin())
          .send({ email: `${prefix}-missing@example.test`, password: PASSWORD });
        expect(response.status).toBe(401);
      }
      const loginLimited = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', allowedOrigin())
        .send({ email: `${prefix}-missing@example.test`, password: PASSWORD });
      expect(loginLimited.status).toBe(429);

      const unknownRefresh = 'a'.repeat(96);
      for (let index = 0; index < 10; index += 1) {
        const response = await request(server)
          .post('/api/v1/auth/refresh')
          .set('Origin', allowedOrigin())
          .set('Cookie', `evry_refresh=${unknownRefresh}`)
          .send({});
        expect(response.status).toBe(401);
      }
      const refreshLimited = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Origin', allowedOrigin())
        .set('Cookie', `evry_refresh=${unknownRefresh}`)
        .send({});
      expect(refreshLimited.status).toBe(429);

      for (const limited of [registerLimited, loginLimited, refreshLimited]) {
        expect(limited.body).toEqual({
          code: 'RATE_LIMITED',
          message: 'Demasiadas solicitudes. Inténtalo más tarde.',
          retryable: true,
          requestId: expect.any(String),
        });
        expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      }
    } finally {
      if (createdIds.length > 0) {
        await isolatedPrisma.user.deleteMany({ where: { id: { in: createdIds } } });
      }
      await isolatedApp.close();
    }
  });
});
