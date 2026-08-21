import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('authentication rate limits', () => {
  let app: INestApplication;
  const environment = {
    DATABASE_URL: 'postgresql://evry:password@localhost:5432/evry_test?schema=public',
    JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-thirty-two-characters',
    JWT_REFRESH_SECRET: 'test-refresh-secret-with-at-least-thirty-two-characters',
    PORT: '4000',
    SWAGGER_ENABLED: 'false',
  };
  const savedEnvironment = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const [key, value] of Object.entries(environment)) {
      savedEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }

    const { AppModule } = await import('../../app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({
        login: jest.fn().mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        }),
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('responde 429 y Retry-After después del límite estricto de login', async () => {
    const server = app.getHttpServer();
    const body = { email: 'user@example.com', password: 'valid-password' };

    for (let requestNumber = 0; requestNumber < 5; requestNumber += 1) {
      await request(server).post('/auth/login').send(body).expect(200);
    }

    const response = await request(server).post('/auth/login').send(body).expect(429);

    expect(response.body).toMatchObject({ statusCode: 429 });
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('aplica el guard global a una ruta que no tiene un límite específico', async () => {
    const server = app.getHttpServer();

    for (let requestNumber = 0; requestNumber < 100; requestNumber += 1) {
      await request(server).get('/auth/me').expect(401);
    }

    const response = await request(server).get('/auth/me').expect(429);

    expect(response.headers['retry-after']).toBeDefined();
  });
});
