import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('authentication DTOs', () => {
  it('normaliza un email de login ordinario', async () => {
    const dto = plainToInstance(LoginDto, {
      email: '  USER@EXAMPLE.COM ',
      password: 'valid-password',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
  });

  it.each([
    ['password', { password: 'a'.repeat(129) }],
    ['name', { name: 'a'.repeat(101) }],
  ])('rechaza %s de registro que supera su cota máxima', async (_field, override) => {
    const dto = plainToInstance(RegisterDto, {
      email: 'user@example.com',
      password: 'valid-password',
      name: 'Usuario válido',
      ...override,
    });

    const errors = await validate(dto);

    expect(errors).not.toHaveLength(0);
  });

  it.each([
    ['ASCII beyond bcrypt capacity', 'a'.repeat(73)],
    ['two-byte UTF-8 beyond capacity', 'é'.repeat(37)],
    ['four-byte UTF-8 beyond capacity', '🙂'.repeat(19)],
    ['UTF-8 boundary crossing', 'é'.repeat(35) + 'aé'],
    ['unpaired high surrogate', 'valid-pass\ud800'],
    ['unpaired low surrogate', 'valid-pass\udc00'],
  ])('rejects a new password without silently truncating: %s', async (_name, password) => {
    const dto = plainToInstance(RegisterDto, {
      email: 'user@example.test', name: 'Usuario válido', password,
    });
    expect((await validate(dto)).some(error => error.property === 'password')).toBe(true);
  });

  it.each(['a'.repeat(72), 'é'.repeat(36), '🙂'.repeat(18)])(
    'accepts a full 72-byte new password: %s', async password => {
      const dto = plainToInstance(RegisterDto, {
        email: 'user@example.test', name: 'Usuario válido', password,
      });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it('preserves validation of historical login credentials without rewriting them', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.test', password: 'é'.repeat(64),
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.password).toBe('é'.repeat(64));
  });

  it.each([undefined, null, 42, {}])(
    'returns password validation errors rather than throwing for invalid types: %s', async password => {
      const dto = plainToInstance(RegisterDto, {
        email: 'user@example.test', name: 'Usuario válido', password,
      });
      expect((await validate(dto)).some(error => error.property === 'password')).toBe(true);
    },
  );
});
