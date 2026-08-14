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

    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'Service Unavailable',
      message: 'La base de datos no está disponible. Revisa DATABASE_URL e inténtalo de nuevo.',
    });
  }
}
