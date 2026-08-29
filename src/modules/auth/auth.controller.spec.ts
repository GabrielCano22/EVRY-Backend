import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
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
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, descriptor!.value)).toBe(limit);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, descriptor!.value)).toBe(60_000);
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
