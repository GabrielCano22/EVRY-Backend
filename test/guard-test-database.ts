import { assertSafeTestDatabase } from './database-safety';

export { assertSafeTestDatabase } from './database-safety';

export function configureIntegrationTestDatabase(): void {
  process.env.DATABASE_URL = assertSafeTestDatabase(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
  );
}

if (process.env.JEST_WORKER_ID) {
  configureIntegrationTestDatabase();
}
