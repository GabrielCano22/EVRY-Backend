type DatabaseIdentity = {
  protocol: 'postgresql';
  host: string;
  port: string;
  database: string;
};

function parsePostgresDatabaseUrl(url: string, variableName: string): DatabaseIdentity {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  const database = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, '').toLowerCase();

  if (!parsed.hostname || !database || database.includes('/')) {
    throw new Error(`${variableName} must identify a PostgreSQL database.`);
  }

  return {
    protocol: 'postgresql',
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    database,
  };
}

function hasExplicitTestMarker(databaseName: string): boolean {
  return /(^|[^a-z0-9])test([^a-z0-9]|$)/i.test(databaseName);
}

function identifiesSameDatabase(left: DatabaseIdentity, right: DatabaseIdentity): boolean {
  return left.protocol === right.protocol
    && left.host === right.host
    && left.port === right.port
    && left.database === right.database;
}

export function assertSafeTestDatabase(
  testUrl: string | undefined,
  runtimeUrl: string | undefined,
): string {
  const safeTestUrl = testUrl?.trim();
  const safeRuntimeUrl = runtimeUrl?.trim();

  if (!safeTestUrl) {
    throw new Error('TEST_DATABASE_URL is required for integration tests.');
  }

  const testDatabase = parsePostgresDatabaseUrl(safeTestUrl, 'TEST_DATABASE_URL');
  const runtimeDatabase = safeRuntimeUrl
    ? parsePostgresDatabaseUrl(safeRuntimeUrl, 'DATABASE_URL')
    : undefined;

  if (runtimeDatabase && identifiesSameDatabase(testDatabase, runtimeDatabase)) {
    throw new Error('TEST_DATABASE_URL must be different from DATABASE_URL.');
  }

  if (!hasExplicitTestMarker(testDatabase.database)) {
    throw new Error('TEST_DATABASE_URL must contain an explicit test marker.');
  }

  return safeTestUrl;
}

export function configureIntegrationTestDatabase(): void {
  process.env.DATABASE_URL = assertSafeTestDatabase(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
  );
}

if (process.env.JEST_WORKER_ID) {
  configureIntegrationTestDatabase();
}
