import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const INVALID_ORIGIN_MESSAGE = 'El origen de la solicitud no está permitido.';

@Injectable()
export class WebOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.header('Origin');
    const allowedOrigins = this.config.getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((allowed) => allowed.trim())
      .filter(Boolean);

    if (!origin || !this.isAllowedOrigin(origin, allowedOrigins)) {
      throw new ForbiddenException(INVALID_ORIGIN_MESSAGE);
    }

    return true;
  }

  private isAllowedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
    try {
      const parsed = new URL(origin);
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:')
        && parsed.origin === origin
        && allowedOrigins.includes(origin)
      );
    } catch {
      return false;
    }
  }
}
