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

    prisma.user.findUnique.mockResolvedValueOnce(null);
    let missingEmailError: unknown;
    try {
      await service.login(credentials);
    } catch (error) {
      missingEmailError = error;
    }

    prisma.user.findUnique.mockResolvedValueOnce({ passwordHash: 'hash' });
    const compare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
    compare.mockResolvedValue(false as never);
    let wrongPasswordError: unknown;
    try {
      await service.login(credentials);
    } catch (error) {
      wrongPasswordError = error;
    } finally {
      compare.mockReset();
    }

    expect(missingEmailError).toBeInstanceOf(UnauthorizedException);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
    expect((missingEmailError as UnauthorizedException).getResponse()).toEqual(
      (wrongPasswordError as UnauthorizedException).getResponse(),
    );
  });
});
