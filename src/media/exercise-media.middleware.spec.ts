import { once } from 'node:events';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import {
  configuredCorsOrigins,
  registerExerciseMedia,
} from './exercise-media.middleware';

type HttpResult = {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function call(
  server: Server,
  path: string,
  options: { method?: 'GET' | 'HEAD'; headers?: Record<string, string> } = {},
): Promise<HttpResult> {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test TCP port.');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const client = request({
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: options.method ?? 'GET',
      headers: options.headers,
    }, (response) => {
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    client.on('error', reject);
    client.end();
  });
}

async function startServer(assetsDirectory: string): Promise<Server> {
  const app = express();
  registerExerciseMedia(app, assetsDirectory, {
    allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

describe('exercise media middleware', () => {
  const realAssets = join(process.cwd(), 'assets', 'exercises');
  const gifPath = '/media/exercises/videos/0001-2gPfomN.gif';

  it('normalizes only explicitly configured origins for global and media CORS', () => {
    expect(configuredCorsOrigins(' http://localhost:3000,https://evry.test,http://localhost:3000 '))
      .toEqual(['http://localhost:3000', 'https://evry.test']);
    expect(configuredCorsOrigins('')).toEqual([]);
  });

  it('exposes validators and lengths to an allowed origin with revalidatable caching', async () => {
    const server = await startServer(realAssets);
    try {
      const response = await call(server, gifPath, {
        headers: { Origin: 'http://localhost:3000' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers.vary).toContain('Origin');
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(response.headers['access-control-expose-headers']).toBe('Content-Length, ETag');
      expect(Number(response.headers['content-length'])).toBeGreaterThan(0);
      expect(response.headers.etag).toEqual(expect.any(String));
      expect(response.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
      expect(response.headers['cache-control']).not.toContain('immutable');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('keeps public assets reachable without granting CORS to a disallowed origin', async () => {
    const server = await startServer(realAssets);
    try {
      const response = await call(server, gifPath, {
        headers: { Origin: 'https://untrusted.example' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('preserves HEAD and conditional ETag requests', async () => {
    const server = await startServer(realAssets);
    try {
      const head = await call(server, gifPath, { method: 'HEAD' });
      expect(head.statusCode).toBe(200);
      expect(head.body).toBe('');
      expect(Number(head.headers['content-length'])).toBeGreaterThan(0);

      const cached = await call(server, gifPath, {
        headers: { 'If-None-Match': String(head.headers.etag) },
      });
      expect(cached.statusCode).toBe(304);
      expect(cached.body).toBe('');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it.each([
    '/media/exercises/missing.gif',
    '/media/exercises/../package.json',
    '/media/exercises/%2e%2e/package.json',
    '/media/exercises/%2e%2e%2fpackage.json',
    '/media/exercises/%5c..%5cpackage.json',
    '/media/exercises/.secret',
    '/media/exercises/images/',
  ])('returns a path-safe 404 for %s', async (path) => {
    const server = await startServer(realAssets);
    try {
      const response = await call(server, path);

      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('Medio no encontrado.');
      expect(response.body).not.toContain(process.cwd());
      expect(response.body).not.toMatch(/[A-Z]:\\/i);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('blocks a future symlink that resolves outside the configured asset root when supported', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'evry-media-'));
    const assets = join(tempRoot, 'assets');
    const videos = join(assets, 'videos');
    const outside = join(tempRoot, 'outside.txt');
    mkdirSync(videos, { recursive: true });
    copyFileSync(join(realAssets, 'videos', '0001-2gPfomN.gif'), join(videos, 'valid.gif'));
    writeFileSync(outside, 'secret outside asset root');
    try {
      try {
        symlinkSync(outside, join(videos, 'future.gif'), 'file');
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        expect(['EPERM', 'EACCES', 'ENOSYS']).toContain(code);
        return;
      }
      const server = await startServer(assets);
      try {
        expect(await call(server, '/media/exercises/videos/valid.gif')).toMatchObject({ statusCode: 200 });
        expect(await call(server, '/media/exercises/videos/future.gif')).toEqual(expect.objectContaining({
          statusCode: 404,
          body: 'Medio no encontrado.',
        }));
      } finally {
        server.close();
        await once(server, 'close');
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
