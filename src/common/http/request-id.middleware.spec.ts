import { randomUUID } from 'node:crypto';
import { requestIdMiddleware } from './request-id.middleware';

describe('requestIdMiddleware', () => {
  it('conserva un identificador UUID válido y lo expone en la respuesta', () => {
    const requestId = randomUUID();
    const request = { headers: { 'x-request-id': requestId } };
    const response = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(request as never, response as never, next);

    expect(request).toMatchObject({ requestId });
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reemplaza identificadores no confiables por un UUID', () => {
    const request = { headers: { 'x-request-id': 'token-secreto-no-valido' } };
    const response = { setHeader: jest.fn() };

    requestIdMiddleware(request as never, response as never, jest.fn());

    expect(request).toHaveProperty('requestId', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(request).not.toHaveProperty('requestId', 'token-secreto-no-valido');
  });
});
