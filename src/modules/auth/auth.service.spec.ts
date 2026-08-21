import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('AuthService', () => {
  it('rechaza un refresh sin cookie sin provocar un error 500', async () => {
    const service = new AuthService({} as never, {} as never, {} as never);

    await expect(service.refresh(undefined as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('devuelve el mismo mensaje cuando el email no existe y cuando falla la contraseña', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);
    const credentials = { email: 'user@example.com', password: 'wrong-password' };

    const compare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
    compare.mockResolvedValue(false as never);
    prisma.user.findUnique.mockResolvedValueOnce(null);
    let missingEmailError: unknown;
    try {
      await service.login(credentials);
    } catch (error) {
      missingEmailError = error;
    }

    prisma.user.findUnique.mockResolvedValueOnce({ passwordHash: 'hash' });
    let wrongPasswordError: unknown;
    try {
      await service.login(credentials);
    } catch (error) {
      wrongPasswordError = error;
    }

    expect(missingEmailError).toBeInstanceOf(UnauthorizedException);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
    expect(compare).toHaveBeenCalledTimes(2);
    expect((missingEmailError as UnauthorizedException).getResponse()).toEqual(
      (wrongPasswordError as UnauthorizedException).getResponse(),
    );
    compare.mockReset();
  });

  it('emite tokens una sola vez para credenciales válidas', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-id',
          email: 'user@example.com',
          passwordHash: 'valid-hash',
        }),
      },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('validated-secret'),
      get: jest.fn().mockReturnValue('15m'),
    };
    const compare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
    compare.mockResolvedValue(true as never);
    const service = new AuthService(prisma as never, jwt as never, config as never);

    const tokens = await service.login({ email: 'user@example.com', password: 'valid-password' });

    expect(compare).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(tokens.accessToken).toBe('access-token');
    compare.mockReset();
  });
});
