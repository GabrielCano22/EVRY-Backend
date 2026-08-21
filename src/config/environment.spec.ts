import { validateEnvironment } from './environment';

const validEnvironment = () => ({
  DATABASE_URL: 'postgresql://evry:password@localhost:5432/evry?schema=public',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-thirty-two-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-thirty-two-characters',
  PORT: '4000',
  SWAGGER_ENABLED: 'false',
});

describe('validateEnvironment', () => {
  it('rechaza una configuración sin secretos JWT', () => {
    const environment: Record<string, unknown> = validEnvironment();
    delete environment.JWT_ACCESS_SECRET;

    expect(() => validateEnvironment(environment)).toThrow('JWT_ACCESS_SECRET');
  });

  it.each([
    ['placeholder público con espacios y mayúsculas', ' DEV-SECRET '],
    ['placeholder documentado con espacios y mayúsculas', ' REPLACE-WITH-A-UNIQUE-RANDOM-ACCESS-SECRET '],
    ['secreto corto', 'a'.repeat(31)],
  ])('rechaza %s', (_description, accessSecret) => {
    expect(() =>
      validateEnvironment({ ...validEnvironment(), JWT_ACCESS_SECRET: accessSecret }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('rechaza secretos equivalentes después de normalizarlos', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        JWT_REFRESH_SECRET: ' ACCESS-SECRET-WITH-AT-LEAST-THIRTY-TWO-CHARACTERS ',
      }),
    ).toThrow('different');
  });

  it.each([
    ['DATABASE_URL ausente', { DATABASE_URL: ' ' }],
    ['puerto no numérico', { PORT: 'four-thousand' }],
    ['puerto fuera de rango', { PORT: '65536' }],
    ['flag Swagger no booleano', { SWAGGER_ENABLED: 'yes' }],
  ])('rechaza %s', (_description, override) => {
    expect(() => validateEnvironment({ ...validEnvironment(), ...override })).toThrow();
  });

  it('acepta la configuración explícita y convierte puerto y Swagger', () => {
    const config = validateEnvironment(validEnvironment());

    expect(config).toMatchObject({ PORT: 4000, SWAGGER_ENABLED: false });
  });

  it('rechaza secretos de fixture fuera de NODE_ENV=test', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'evry-test-access-secret-with-at-least-32-characters',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('permite secretos de fixture solo con NODE_ENV=test explícito', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        NODE_ENV: ' TEST ',
        JWT_ACCESS_SECRET: 'evry-test-access-secret-with-at-least-32-characters',
      }),
    ).not.toThrow();
  });
});
