import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface PrismaErrorResponse {
  statusCode: HttpStatus;
  error: string;
  code: string;
  message: string;
  retryable: boolean;
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter
  implements ExceptionFilter<Prisma.PrismaClientKnownRequestError>
{
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const payload = this.toResponse(exception.code);

    if (payload.retryable) response.setHeader('Retry-After', '5');
    response.status(payload.statusCode).json(payload);
  }

  private toResponse(code: string): PrismaErrorResponse {
    switch (code) {
      case 'P2002':
        return this.response(
          HttpStatus.CONFLICT,
          'Conflict',
          'CONFLICT',
          'La operación entra en conflicto con el estado actual.',
        );
      case 'P2003':
        return this.response(
          HttpStatus.CONFLICT,
          'Conflict',
          'RELATION_CONFLICT',
          'La operación entra en conflicto con el estado actual.',
        );
      case 'P2025':
        return this.response(
          HttpStatus.NOT_FOUND,
          'Not Found',
          'NOT_FOUND',
          'El recurso solicitado no existe.',
        );
      default:
        return this.response(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Internal Server Error',
          'DATABASE_ERROR',
          'No se pudo completar la operación.',
        );
    }
  }

  private response(
    statusCode: HttpStatus,
    error: string,
    code: string,
    message: string,
    retryable = false,
  ): PrismaErrorResponse {
    return { statusCode, error, code, message, retryable };
  }
}
