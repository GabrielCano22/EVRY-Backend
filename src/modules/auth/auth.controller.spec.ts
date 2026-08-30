import { RATE_LIMIT_METADATA } from '../../common/rate-limit/rate-limit.decorator';
import { AuthController } from './auth.controller';
import { MobileAuthController } from './mobile-auth.controller';

describe('AuthController rate limits', () => {
  it.each([
    ['login', 5],
    ['register', 3],
    ['refresh', 10],
  ] as const)('limita %s con un umbral estricto', (handler, limit) => {
    const descriptor = Object.getOwnPropertyDescriptor(AuthController.prototype, handler);

    expect(descriptor).toBeDefined();
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA, descriptor!.value)).toEqual({
      limit,
      ttlMs: 60_000,
    });
  });
});

describe('MobileAuthController', () => {
  it('devuelve el refresh token en el cuerpo para almacenarlo en SecureStore', async () => {
    const expiresAt = new Date('2026-09-28T10:00:00.000Z');
    const auth = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt,
      }),
    };
    const controller = new MobileAuthController(auth as never);

    await expect(controller.login({ email: 'user@example.com', password: 'valid-password' }))
      .resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh', expiresAt });
    expect(auth.login).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'valid-password' },
      'MOBILE',
    );
  });
});
