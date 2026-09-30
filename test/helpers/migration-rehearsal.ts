import { assertSafeTestDatabase } from '../database-safety';
import { join } from 'node:path';

export function assertLocalMigrationDatabase(testUrl: string | undefined, runtimeUrl: string | undefined): string {
  const safeUrl = assertSafeTestDatabase(testUrl, runtimeUrl);
  const localHosts = ['127.0.0.1', 'localhost', '[::1]'];
  const target = new URL(safeUrl);
  if (!localHosts.includes(target.hostname)) {
    throw new Error('Migration rehearsal requires a loopback PostgreSQL host.');
  }
  if (runtimeUrl) {
    const runtime = new URL(runtimeUrl);
    if (localHosts.includes(runtime.hostname)
      && (runtime.port || '5432') === (target.port || '5432')
      && decodeURIComponent(runtime.pathname).toLowerCase() === decodeURIComponent(target.pathname).toLowerCase()) {
      throw new Error('TEST_DATABASE_URL must be different from DATABASE_URL, including loopback aliases.');
    }
  }
  for (const [key, value] of target.searchParams) {
    if (key !== 'schema' || value !== 'public') {
      throw new Error('Migration rehearsal rejects connection query overrides (only schema=public is allowed).');
    }
  }
  return safeUrl;
}

export function buildPgToolCommand(tool: 'pg_dump' | 'pg_restore', url: string, args: string[], inherited: NodeJS.ProcessEnv = process.env): { file: string; args: string[]; env: NodeJS.ProcessEnv } {
  const parsed = new URL(assertLocalMigrationDatabase(url, undefined));
  const connection = {
    PGHOST: parsed.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGOPTIONS: '',
    PGSSLMODE: 'disable',
  };
  const env: NodeJS.ProcessEnv = { ...inherited, ...connection };
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGPASSFILE']) delete env[key];
  const container = inherited.EVRY_PG_TOOLS_CONTAINER;
  const file = container ? 'docker' : inherited.PG_BIN_DIRECTORY
    ? join(inherited.PG_BIN_DIRECTORY, `${tool}${process.platform === 'win32' ? '.exe' : ''}`) : tool;
  const toolArgs = container
    ? ['exec', '-i', container, 'env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', ...Object.entries(connection).map(([key, value]) => `${key}=${value}`), tool, ...args]
    : args;
  return { file, args: toolArgs, env };
}
