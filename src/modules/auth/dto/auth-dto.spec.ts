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
});
