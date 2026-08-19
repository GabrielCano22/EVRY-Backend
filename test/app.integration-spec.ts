import { assertSafeTestDatabase } from './guard-test-database';

function callGuard(testUrl: string | undefined, runtimeUrl: string | undefined): string {
  return assertSafeTestDatabase(testUrl, runtimeUrl);
}

describe('test database guard', () => {
  const productionUrl = 'postgresql://evry:secret@localhost:5432/evry';

  it('rejects a missing test database URL', () => {
    expect(() => callGuard(undefined, productionUrl)).toThrow('TEST_DATABASE_URL');
  });

  it('rejects a test database URL equal to the runtime database URL', () => {
    expect(() => callGuard(productionUrl, productionUrl)).toThrow('different');
  });

  it('rejects the same database when only protocol, credentials, query, hash, and default port differ', () => {
    expect(() => callGuard(
      'postgresql://test-user:password@LOCALHOST:5432/evry_test?application_name=test#fragment',
      'postgres://production:other-password@localhost/evry_test',
    )).toThrow('different');
  });

  it.each([
    'postgresql://test-user:secret@localhost:5432/evry_development',
    'postgresql://evry:secret-test@localhost:5432/evry_development',
    'postgresql://evry:secret@localhost:5432/evry_development?application_name=test',
  ])('rejects test markers outside the database name: %s', (url) => {
    expect(() => callGuard(url, productionUrl)).toThrow('explicit test marker');
  });

  it('returns an explicitly marked test database URL distinct from runtime', () => {
    const testUrl = 'postgresql://evry:secret@localhost:5432/evry_test?application_name=evry';

    expect(callGuard(testUrl, productionUrl)).toBe(testUrl);
  });

  it('runs the integration runner with the America/Bogota timezone', () => {
    expect(process.env.TZ).toBe('America/Bogota');
  });
});
