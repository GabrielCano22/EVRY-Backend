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

  it('rejects a database URL without an explicit test marker', () => {
    expect(() => callGuard('postgresql://evry:secret@localhost:5432/evry_development', productionUrl)).toThrow('explicit test marker');
  });

  it('returns an explicitly marked test database URL distinct from runtime', () => {
    const testUrl = 'postgresql://evry:secret@localhost:5432/evry_test';

    expect(callGuard(testUrl, productionUrl)).toBe(testUrl);
  });
});
