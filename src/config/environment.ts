export interface RuntimeConfig {
  databaseUrl: string;
  jwtSecret: string;
  refreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  corsOrigins: string[];
  port: number;
  swaggerEnabled: boolean;
}

const MIN_SECRET_LENGTH = 32;
const DEVELOPMENT_SECRET = 'dev-secret';
const MIN_ACCESS_TTL_SECONDS = 60;
const MAX_ACCESS_TTL_SECONDS = 60 * 60;
const MIN_REFRESH_TTL_DAYS = 1;
const MAX_REFRESH_TTL_DAYS = 90;

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

function jwtAccessTtl(env: Record<string, unknown>): string {
  const value = requiredString(env, 'JWT_ACCESS_TTL');
  const match = /^(\d+)([smh])$/.exec(value);
  if (!match) {
    throw new Error('JWT_ACCESS_TTL must be between 60 seconds and 1 hour using s, m or h.');
  }

  const amount = Number(match[1]);
  const multiplier = match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1;
  const seconds = amount * multiplier;
  if (seconds < MIN_ACCESS_TTL_SECONDS || seconds > MAX_ACCESS_TTL_SECONDS) {
    throw new Error('JWT_ACCESS_TTL must be between 60 seconds and 1 hour using s, m or h.');
  }

  return value;
}

function jwtRefreshTtl(env: Record<string, unknown>): string {
  const value = requiredString(env, 'JWT_REFRESH_TTL');
  const match = /^(\d+)d$/.exec(value);
  const days = match ? Number(match[1]) : Number.NaN;
  if (!match || days < MIN_REFRESH_TTL_DAYS || days > MAX_REFRESH_TTL_DAYS) {
    throw new Error('JWT_REFRESH_TTL must be between 1d and 90d.');
  }

  return value;
}

function corsOriginValue(env: Record<string, unknown>): string {
  const raw = requiredString(env, 'CORS_ORIGIN');
  const origins = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error('CORS_ORIGIN must include at least one origin.');
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGIN must contain valid HTTP origins.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin.replace(/\/+$/, '')) {
      throw new Error('CORS_ORIGIN must contain valid HTTP origins.');
    }
  }
  return origins.map((origin) => origin.replace(/\/+$/, '')).join(',');
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

  const accessTtl = jwtAccessTtl(env);
  const refreshTtl = jwtRefreshTtl(env);

  const port = portValue(env);
  const corsOrigin = corsOriginValue(env);
  const swaggerEnabled = booleanValue(env, 'SWAGGER_ENABLED');

  return {
    ...env,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL: accessTtl,
    JWT_REFRESH_TTL: refreshTtl,
    PORT: port,
    CORS_ORIGIN: corsOrigin,
    SWAGGER_ENABLED: swaggerEnabled,
  };
}
