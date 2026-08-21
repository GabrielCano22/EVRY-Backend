import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientInitializationError)
export class PrismaConnectionExceptionFilter
  implements ExceptionFilter<Prisma.PrismaClientInitializationError>
{
  catch(_exception: Prisma.PrismaClientInitializationError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();

    response.setHeader('Retry-After', '5');
    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'Service Unavailable',
      code: 'DATABASE_UNAVAILABLE',
      message: 'El servicio de datos no está disponible. Inténtalo de nuevo.',
      retryable: true,
    });
  }
}
