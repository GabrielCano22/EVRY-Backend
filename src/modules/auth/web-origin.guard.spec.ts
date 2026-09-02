import { ForbiddenException } from '@nestjs/common';
import { WebOriginGuard } from './web-origin.guard';

function context(origin?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => name === 'Origin' ? origin : undefined }),
    }),
  } as never;
}

describe('WebOriginGuard', () => {
  const config = { getOrThrow: () => 'https://evry.example,http://127.0.0.1:3000' };
  const guard = new WebOriginGuard(config as never);

  it.each([undefined, 'null', 'not a url', 'https://evry.example.attacker.test', 'https://evry.example/'])(
    'rejects missing, malformed or non-exact browser origin %p',
    (origin) => expect(() => guard.canActivate(context(origin))).toThrow(ForbiddenException),
  );

  it.each(['https://evry.example', 'http://127.0.0.1:3000'])(
    'accepts configured exact browser origin %s',
    (origin) => expect(guard.canActivate(context(origin))).toBe(true),
  );

  it('does not add implicit origins outside the validated configuration', () => {
    const strict = new WebOriginGuard({ getOrThrow: () => 'https://evry.example' } as never);
    expect(() => strict.canActivate(context('http://127.0.0.1:3000'))).toThrow(ForbiddenException);
  });
});
