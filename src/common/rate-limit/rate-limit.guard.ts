import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isIP } from 'node:net';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_METADATA,
  type RateLimitOptions,
  SKIP_RATE_LIMIT_METADATA,
} from './rate-limit.decorator';
import { RateLimitStore, type RateLimitResult } from './rate-limit.store';

const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 100, ttlMs: 60_000 };

function clientAddress(request: Request): string {
  // Only the server-controlled Vercel runtime flag enables platform headers.
  // Outside that boundary, preserve Express's default refusal to trust proxies.
  if (process.env.VERCEL !== '1') {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
  // Vercel supplies this dedicated header at its ingress. Never substitute a
  // user-supplied forwarding chain, x-real-ip, or a shared proxy socket address.
  const address = request.headers['x-vercel-forwarded-for'];
  if (typeof address !== 'string' || address.length > 45
    || address.includes('%') || !isIP(address)) {
    throw new HttpException(
      'No pudimos verificar el límite de solicitudes. Inténtalo más tarde.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  // Collapse equivalent IPv6 spellings into one quota without storing raw IPs.
  return isIP(address) === 6
    ? new URL(`http://[${address}]`).hostname.slice(1, -1)
    : address;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly store: RateLimitStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_METADATA, [context.getHandler(), context.getClass()])) return true;
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]) ?? DEFAULT_RATE_LIMIT;
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const identity = JSON.stringify([
      clientAddress(request),
      context.getClass().name,
      context.getHandler().name,
    ]);
    let result: RateLimitResult;
    try {
      result = await this.store.consume(identity, options);
    } catch {
      // Never fall back to a fresh local quota when shared protection is unavailable.
      throw new HttpException('No pudimos verificar el límite de solicitudes. Inténtalo más tarde.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfter));
      throw new HttpException(
        'Demasiadas solicitudes. Inténtalo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
