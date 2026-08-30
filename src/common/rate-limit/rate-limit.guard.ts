import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_METADATA,
  type RateLimitOptions,
} from './rate-limit.decorator';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 100, ttlMs: 60_000 };
const MAX_TRACKED_KEYS = 10_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]) ?? DEFAULT_RATE_LIMIT;
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const now = Date.now();
    const key = [
      request.ip || request.socket.remoteAddress || 'unknown',
      context.getClass().name,
      context.getHandler().name,
    ].join(':');
    const existing = this.entries.get(key);
    const entry = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + options.ttlMs }
      : existing;

    if (entry.count >= options.limit) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      throw new HttpException(
        'Demasiadas solicitudes. Inténtalo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    this.entries.set(key, entry);
    this.prune(now);
    return true;
  }

  private prune(now: number): void {
    if (this.entries.size <= MAX_TRACKED_KEYS) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > MAX_TRACKED_KEYS) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}
