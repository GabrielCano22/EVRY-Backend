import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function responseHost() {
  const response = {
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as never;
  return { host, response };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('SELECT private_schema.secret FROM private_table', {
    clientVersion: '5.10.0',
    code,
    meta: { target: ['Workout_userId_active_key'] },
  });
}

describe('PrismaExceptionFilter', () => {
  it.each([
    ['P2002', 409, 'Conflict', 'CONFLICT'],
    ['P2003', 409, 'Conflict', 'RELATION_CONFLICT'],
    ['P2025', 404, 'Not Found', 'NOT_FOUND'],
  ])('normaliza %s sin filtrar SQL ni metadatos', (code, statusCode, error, responseCode) => {
    const { host, response } = responseHost();

    new PrismaExceptionFilter().catch(prismaError(code), host);

    expect(response.status).toHaveBeenCalledWith(statusCode);
    expect(response.json).toHaveBeenCalledWith({
      statusCode,
      error,
      code: responseCode,
      message: code === 'P2025' ? 'El recurso solicitado no existe.' : 'La operación entra en conflicto con el estado actual.',
      retryable: false,
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private_schema');
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('Workout_userId_active_key');
  });

});
