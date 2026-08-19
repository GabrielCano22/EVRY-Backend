import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertSafeTestDatabase } from '../test/guard-test-database';

const testDatabaseUrl = assertSafeTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
);

process.env.DATABASE_URL = testDatabaseUrl;

execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], {
  cwd: resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
