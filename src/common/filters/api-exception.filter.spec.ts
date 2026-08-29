import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiExceptionFilter } from './api-exception.filter';

function responseHost(requestId = '0c73ce04-63c5-49df-9464-31d88a476e20') {
  const response = {
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
  const request = { requestId };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as never;
  return { host, response };
}

describe('ApiExceptionFilter', () => {
  it('normaliza errores de validación por campo', () => {
    const { host, response } = responseHost();
    const exception = new BadRequestException({
      message: ['email must be an email', 'password must be longer than or equal to 8 characters'],
      error: 'Bad Request',
      statusCode: 400,
    });

    new ApiExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Revisa los datos enviados.',
      fieldErrors: {
        email: ['email must be an email'],
        password: ['password must be longer than or equal to 8 characters'],
      },
      requestId: '0c73ce04-63c5-49df-9464-31d88a476e20',
      retryable: false,
    });
  });

  it('normaliza conflictos Prisma sin filtrar SQL ni metadatos', () => {
    const { host, response } = responseHost();
    const exception = new Prisma.PrismaClientKnownRequestError('SELECT private.secret', {
      clientVersion: '5.22.0',
      code: 'P2002',
      meta: { target: ['secret_unique'] },
    });

    new ApiExceptionFilter().catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({
      code: 'CONFLICT',
      message: 'La operación entra en conflicto con el estado actual.',
      requestId: '0c73ce04-63c5-49df-9464-31d88a476e20',
      retryable: false,
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('private.secret');
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret_unique');
  });

  it('oculta errores inesperados y los marca como no reintentables', () => {
    const { host, response } = responseHost();

    new ApiExceptionFilter().catch(new Error('JWT super secret'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'No se pudo completar la operación.',
      requestId: '0c73ce04-63c5-49df-9464-31d88a476e20',
      retryable: false,
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('JWT super secret');
  });
});
