import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { RequestWithId } from '../http/request-id.middleware';

interface ApiErrorPayload {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  retryable: boolean;
  requestId: string;
  serverVersion?: unknown;
}

interface NormalizedError extends Omit<ApiErrorPayload, 'requestId'> {
  status: HttpStatus;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const normalized = this.normalize(exception);

    if (normalized.retryable) response.setHeader('Retry-After', '5');
    const { status, ...payload } = normalized;
    response.status(status).json({
      ...payload,
      requestId: request.requestId,
    } satisfies ApiErrorPayload);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return this.error(
        HttpStatus.SERVICE_UNAVAILABLE,
        'DATABASE_UNAVAILABLE',
        'El servicio de datos no está disponible. Inténtalo de nuevo.',
        true,
      );
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return this.error(
          HttpStatus.CONFLICT,
          'CONFLICT',
          'La operación entra en conflicto con el estado actual.',
        );
      }
      if (exception.code === 'P2003') {
        return this.error(
          HttpStatus.CONFLICT,
          'RELATION_CONFLICT',
          'La operación entra en conflicto con el estado actual.',
        );
      }
      if (exception.code === 'P2025') {
        return this.error(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'El recurso solicitado no existe.');
      }
      return this.error(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'DATABASE_ERROR',
        'No se pudo completar la operación.',
      );
    }

    if (exception instanceof HttpException) {
      return this.normalizeHttpException(exception);
    }

    return this.error(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'No se pudo completar la operación.',
    );
  }

  private normalizeHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (status === HttpStatus.BAD_REQUEST && typeof body === 'object' && body !== null) {
      const messages = (body as { message?: unknown }).message;
      if (Array.isArray(messages)) {
        const fieldErrors = this.validationErrors(
          messages.filter((item): item is string => typeof item === 'string'),
        );
        return {
          ...this.error(status, 'VALIDATION_ERROR', 'Revisa los datos enviados.'),
          ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
        };
      }
    }

    const codeByStatus: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
    };
    const publicMessage = typeof body === 'string'
      ? body
      : typeof body === 'object'
          && body !== null
          && typeof (body as { message?: unknown }).message === 'string'
        ? String((body as { message: string }).message)
        : exception.message;
    const normalized = this.error(
      status,
      typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string'
        ? String((body as { code: string }).code)
        : codeByStatus[status] ?? `HTTP_${status}`,
      publicMessage,
      status === HttpStatus.SERVICE_UNAVAILABLE || status === HttpStatus.TOO_MANY_REQUESTS,
    );
    if (typeof body === 'object' && body !== null && 'serverVersion' in body) {
      return { ...normalized, serverVersion: (body as { serverVersion: unknown }).serverVersion };
    }
    return normalized;
  }

  private validationErrors(messages: string[]): Record<string, string[]> {
    return messages.reduce<Record<string, string[]>>((errors, message) => {
      const [field] = message.split(/\s+/, 1);
      if (!field || !/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) return errors;
      (errors[field] ??= []).push(message);
      return errors;
    }, {});
  }

  private error(
    status: HttpStatus,
    code: string,
    message: string,
    retryable = false,
  ): NormalizedError {
    return { status, code, message, retryable };
  }
}
