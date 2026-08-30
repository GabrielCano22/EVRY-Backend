import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestWithId = Request & { requestId: string };

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const candidate = request.headers['x-request-id'];
  const requestId = typeof candidate === 'string' && UUID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();

  (request as RequestWithId).requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
}
