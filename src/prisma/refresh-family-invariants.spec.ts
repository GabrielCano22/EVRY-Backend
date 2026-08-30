import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(root, 'prisma', 'migrations', '20260829020000_refresh_token_families', 'migration.sql'),
  'utf8',
);

describe('refresh token family invariants', () => {
  it('stores platform and family without persisting raw tokens', () => {
    expect(schema).toContain('enum RefreshTokenPlatform');
    expect(schema).toMatch(/familyId\s+String\s+@db\.Uuid/);
    expect(schema).toMatch(/platform\s+RefreshTokenPlatform/);
    expect(schema).toMatch(/tokenHash\s+String\s+@unique/);
    expect(schema).not.toMatch(/refreshToken\s+String/);
  });

  it('backfills existing web sessions without deleting them', () => {
    expect(migration).toContain('ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "familyId" UUID');
    expect(migration).toContain("SET \"platform\" = 'WEB'");
    expect(migration).toContain('ALTER COLUMN "familyId" SET NOT NULL');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"RefreshToken"/i);
  });
});
