export interface RuntimeConfig {
  databaseUrl: string;
  jwtSecret: string;
  refreshSecret: string;
  port: number;
  swaggerEnabled: boolean;
}

const MIN_SECRET_LENGTH = 32;
const DEVELOPMENT_SECRET = 'dev-secret';

function requiredString(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function jwtSecret(env: Record<string, unknown>, key: string): string {
  const value = requiredString(env, key);
  const normalizedValue = value.toLowerCase();
  const nodeEnv = typeof env.NODE_ENV === 'string' ? env.NODE_ENV.trim().toLowerCase() : undefined;
  const isDocumentedPlaceholder =
    normalizedValue === DEVELOPMENT_SECRET ||
    normalizedValue.includes('change-me') ||
    normalizedValue.includes('replace-with');
  const isTestFixtureSecret =
    normalizedValue.startsWith('evry-test-') ||
    /^(?:test-(?:access|refresh)-secret)(?:[-_]|$)/.test(normalizedValue);
  if (
    value.length < MIN_SECRET_LENGTH ||
    isDocumentedPlaceholder ||
    (isTestFixtureSecret && nodeEnv !== 'test')
  ) {
    throw new Error(`${key} must be at least ${MIN_SECRET_LENGTH} characters and not a placeholder.`);
  }

  return value;
}

function booleanValue(env: Record<string, unknown>, key: string): boolean {
  const value = requiredString(env, key).toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be true or false.`);
}

function portValue(env: Record<string, unknown>): number {
  const value = requiredString(env, 'PORT');
  if (!/^\d+$/.test(value)) throw new Error('PORT must be an integer between 1 and 65535.');

  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}

export function validateEnvironment(env: Record<string, unknown>): Record<string, unknown> {
  const databaseUrl = requiredString(env, 'DATABASE_URL');
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid Prisma URL.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
    !parsedDatabaseUrl.hostname ||
    !parsedDatabaseUrl.pathname ||
    parsedDatabaseUrl.pathname === '/'
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL Prisma URL.');
  }

  const accessSecret = jwtSecret(env, 'JWT_ACCESS_SECRET');
  const refreshSecret = jwtSecret(env, 'JWT_REFRESH_SECRET');
  if (accessSecret.toLowerCase() === refreshSecret.toLowerCase()) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.');
  }

  const port = portValue(env);
  const swaggerEnabled = booleanValue(env, 'SWAGGER_ENABLED');

  return {
    ...env,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    PORT: port,
    SWAGGER_ENABLED: swaggerEnabled,
  };
}
