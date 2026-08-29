import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  configuredCorsOrigins,
  registerExerciseMedia,
} from '../src/media/exercise-media.middleware';

describe('exercise media HTTP integration', () => {
  const gifPath = '/media/exercises/videos/0001-2gPfomN.gif';
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    registerExerciseMedia(app, join(process.cwd(), 'assets', 'exercises'), {
      allowedOrigins: configuredCorsOrigins('http://localhost:3000'),
    });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('serves an allowed GET and revalidates the same ETag', async () => {
    const first = await request(app.getHttpServer())
      .get(gifPath)
      .set('Origin', 'http://localhost:3000');

    expect(first.status).toBe(200);
    expect(first.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(first.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(first.headers['access-control-expose-headers']).toBe('Content-Length, ETag');
    expect(first.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(first.headers.etag).toEqual(expect.any(String));

    const cached = await request(app.getHttpServer())
      .get(gifPath)
      .set('If-None-Match', first.headers.etag);
    expect(cached.status).toBe(304);
    expect(cached.body).toEqual({});
  });

  it('keeps HEAD and public access while denying an untrusted CORS origin', async () => {
    const response = await request(app.getHttpServer())
      .head(gifPath)
      .set('Origin', 'https://untrusted.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(Number(response.headers['content-length'])).toBeGreaterThan(0);
    expect(response.text).toBeUndefined();
  });

  it.each([
    '/media/exercises/missing.gif',
    '/media/exercises/%2e%2e%2fpackage.json',
    '/media/exercises/%5c..%5cpackage.json',
    '/media/exercises/.env',
  ])('returns a non-leaking 404 for %s', async (path) => {
    const response = await request(app.getHttpServer()).get(path);

    expect(response.status).toBe(404);
    expect(response.text).toBe('Medio no encontrado.');
    expect(response.text).not.toContain(process.cwd());
  });
});
