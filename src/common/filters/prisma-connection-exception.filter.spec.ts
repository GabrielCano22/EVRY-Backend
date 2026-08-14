import { Prisma } from '@prisma/client';
import { PrismaConnectionExceptionFilter } from './prisma-connection-exception.filter';

describe('PrismaConnectionExceptionFilter', () => {
  it('expone una respuesta 503 en lugar de Internal server error', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as never;
    const exception = new Prisma.PrismaClientInitializationError('P1001', '5.22.0');

    new PrismaConnectionExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'La base de datos no está disponible. Revisa DATABASE_URL e inténtalo de nuevo.',
    });
  });
});
