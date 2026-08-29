import type { NextFunction, Request, Response } from 'express';

const LEGACY_API_PREFIX = '/api';
const CANONICAL_API_PREFIX = '/api/v1';

export function canonicalApiUrl(url: string): string {
  if (url === LEGACY_API_PREFIX) return CANONICAL_API_PREFIX;
  if (url.startsWith(`${LEGACY_API_PREFIX}/`) && !url.startsWith(`${CANONICAL_API_PREFIX}/`)) {
    return `${CANONICAL_API_PREFIX}${url.slice(LEGACY_API_PREFIX.length)}`;
  }
  return url;
}

export function legacyApiAliasMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  request.url = canonicalApiUrl(request.url);
  next();
}
