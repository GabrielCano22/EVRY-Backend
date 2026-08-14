import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('rechaza un refresh sin cookie sin provocar un error 500', async () => {
    const service = new AuthService({} as never, {} as never);

    await expect(service.refresh(undefined as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
