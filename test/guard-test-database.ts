export function assertSafeTestDatabase(
  testUrl: string | undefined,
  runtimeUrl: string | undefined,
): string {
  const safeTestUrl = testUrl?.trim();
  const safeRuntimeUrl = runtimeUrl?.trim();

  if (!safeTestUrl) {
    throw new Error('TEST_DATABASE_URL is required for integration tests.');
  }

  if (safeTestUrl === safeRuntimeUrl) {
    throw new Error('TEST_DATABASE_URL must be different from DATABASE_URL.');
  }

  if (!/(^|[^a-z0-9])test([^a-z0-9]|$)/i.test(safeTestUrl)) {
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
