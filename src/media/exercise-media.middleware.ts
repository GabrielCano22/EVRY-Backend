import express, { type NextFunction, type Request, type Response } from 'express';
import { realpath, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { type RequestHandlerParams } from 'express-serve-static-core';

interface MiddlewareHost {
  use(path: string, ...handlers: RequestHandlerParams[]): unknown;
}

interface ExerciseMediaOptions {
  allowedOrigins?: readonly string[];
}

const MEDIA_NOT_FOUND = 'Medio no encontrado.';

export function configuredCorsOrigins(rawOrigins: string | undefined = process.env.CORS_ORIGIN): string[] {
  const configured = (rawOrigins?.trim() ? rawOrigins : 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set([...configured, 'http://127.0.0.1:3000'])];
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function decodedPath(rawPath: string): string | null {
  let decoded = rawPath.split('?', 1)[0];
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }
  return decoded;
}

function sendNotFound(response: Response): void {
  response.status(404).type('text/plain').send(MEDIA_NOT_FOUND);
}

function confinedAsset(
  assetsRoot: string,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const path = decodedPath(request.url);
  if (!path || path.includes('\\') || path.includes('\0') || path.includes('%')) {
    sendNotFound(response);
    return;
  }
  const segments = path.split('/').filter(Boolean);
  if (
    segments.length === 0
    || segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))
  ) {
    sendNotFound(response);
    return;
  }
  const candidate = resolve(assetsRoot, ...segments);
  if (!isWithin(assetsRoot, candidate)) {
    sendNotFound(response);
    return;
  }

  realpath(candidate, (error, resolvedCandidate) => {
    if (error || !isWithin(assetsRoot, resolvedCandidate)) {
      sendNotFound(response);
      return;
    }
    next();
  });
}

export function registerExerciseMedia(
  app: MiddlewareHost,
  assetsDirectory: string,
  options: ExerciseMediaOptions = {},
) {
  const assetsRoot = realpathSync(assetsDirectory);
  const allowedOrigins = new Set(options.allowedOrigins ?? configuredCorsOrigins());
  app.use(
    '/media/exercises',
    (request: Request, response: Response, next: NextFunction) => {
      const origin = request.header('Origin');
      if (origin) response.vary('Origin');
      if (origin && allowedOrigins.has(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      response.setHeader('Access-Control-Expose-Headers', 'Content-Length, ETag');
      next();
    },
    (request: Request, response: Response, next: NextFunction) => {
      confinedAsset(assetsRoot, request, response, next);
    },
    express.static(assetsRoot, {
      dotfiles: 'deny',
      etag: true,
      fallthrough: false,
      immutable: false,
      index: false,
      maxAge: 0,
      redirect: false,
      setHeaders(response) {
        response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      },
    }),
    (_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      void _next;
      sendNotFound(response);
    },
  );
}
