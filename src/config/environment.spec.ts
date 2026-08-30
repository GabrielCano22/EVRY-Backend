import { randomBytes } from 'node:crypto';
import { validateEnvironment } from './environment';

const validEnvironment = () => ({
  DATABASE_URL: 'postgresql://evry:password@localhost:5432/evry?schema=public',
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  PORT: '4000',
  CORS_ORIGIN: 'http://localhost:3000',
  SWAGGER_ENABLED: 'false',
});

describe('validateEnvironment', () => {
  it('rechaza una configuración sin secretos JWT', () => {
    const environment: Record<string, unknown> = validEnvironment();
    delete environment.JWT_ACCESS_SECRET;

    expect(() => validateEnvironment(environment)).toThrow('JWT_ACCESS_SECRET');
  });

  it('rechaza una configuración sin orígenes CORS explícitos', () => {
    const environment: Record<string, unknown> = validEnvironment();
    delete environment.CORS_ORIGIN;

    expect(() => validateEnvironment(environment)).toThrow('CORS_ORIGIN');
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
    const environment = validEnvironment();
    expect(() =>
      validateEnvironment({
        ...environment,
        JWT_REFRESH_SECRET: ` ${String(environment.JWT_ACCESS_SECRET).toUpperCase()} `,
      }),
    ).toThrow('different');
  });

  it.each([
    ['DATABASE_URL ausente', { DATABASE_URL: ' ' }],
    ['URL Prisma sin hostname', { DATABASE_URL: 'postgresql:///evry' }],
    ['URL Prisma sin nombre de base', { DATABASE_URL: 'postgresql://localhost' }],
    ['URL Prisma con pathname vacío', { DATABASE_URL: 'postgresql://localhost:5432/' }],
    ['puerto no numérico', { PORT: 'four-thousand' }],
    ['puerto fuera de rango', { PORT: '65536' }],
    ['flag Swagger no booleano', { SWAGGER_ENABLED: 'yes' }],
    ['origen CORS no HTTP', { CORS_ORIGIN: 'evry.example.com' }],
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
        JWT_ACCESS_SECRET: `evry-test-${randomBytes(32).toString('hex')}`,
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('permite secretos de fixture solo con NODE_ENV=test explícito', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        NODE_ENV: ' TEST ',
        JWT_ACCESS_SECRET: `evry-test-${randomBytes(32).toString('hex')}`,
      }),
    ).not.toThrow();
  });

  it('rechaza el fixture público heredado fuera de NODE_ENV=test', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment(),
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: `test-access-secret-${randomBytes(32).toString('hex')}`,
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });
});
