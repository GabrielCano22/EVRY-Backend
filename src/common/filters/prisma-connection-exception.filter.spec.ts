import { Prisma } from '@prisma/client';
import { PrismaConnectionExceptionFilter } from './prisma-connection-exception.filter';

describe('PrismaConnectionExceptionFilter', () => {
  it('expone una respuesta 503 reintentable sin detalles de conexion', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as never;
    const exception = new Prisma.PrismaClientInitializationError(
      'P1001: cannot reach postgresql://private-host/internal',
      '5.22.0',
      'P1001',
    );

    new PrismaConnectionExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 503,
      error: 'Service Unavailable',
      code: 'DATABASE_UNAVAILABLE',
      message: 'El servicio de datos no está disponible. Inténtalo de nuevo.',
      retryable: true,
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private-host');
  });
});
