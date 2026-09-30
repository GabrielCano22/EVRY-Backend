import { assertLocalMigrationDatabase, buildPgToolCommand } from './helpers/migration-rehearsal';

describe('migration rehearsal safety', () => {
  const runtime = 'postgresql://blocked@127.0.0.1:1/evry_runtime';

  it.each(['db.example.test', '192.168.1.10', '127.0.0.1.example.com'])('rejects non-loopback host %s before creating fixtures', (host) => {
    expect(() => assertLocalMigrationDatabase(`postgresql://fixture@${host}/evry_test`, runtime))
      .toThrow('loopback');
  });

  it('rejects the runtime database even with another schema', () => {
    expect(() => assertLocalMigrationDatabase('postgresql://fixture@127.0.0.1/evry_test?schema=other', 'postgresql://fixture@127.0.0.1/evry_test'))
      .toThrow('different');
  });

  it.each(['localhost', '[::1]'])('rejects the runtime target through the loopback alias %s', (host) => {
    expect(() => assertLocalMigrationDatabase(`postgresql://fixture@${host}/evry_test`, 'postgresql://fixture@127.0.0.1/evry_test'))
      .toThrow('different');
  });

  it.each(['host=remote.example.test', 'port=5433', 'schema=other'])('rejects connection overrides in the query: %s', (query) => {
    expect(() => assertLocalMigrationDatabase(`postgresql://fixture@127.0.0.1/evry_test?${query}`, runtime))
      .toThrow('query');
  });

  it('allows the CI public schema marker without changing the connection target', () => {
    const url = 'postgresql://fixture@127.0.0.1/evry_test?schema=public';
    expect(assertLocalMigrationDatabase(url, runtime)).toBe(url);
  });

  it('rejects missing or unmarked test targets', () => {
    expect(() => assertLocalMigrationDatabase(undefined, runtime)).toThrow('required');
    expect(() => assertLocalMigrationDatabase('postgresql://fixture@localhost/evry', runtime)).toThrow('test marker');
  });

  it.each(['127.0.0.1', 'localhost', '[::1]'])('allows the explicit local synthetic target %s', (host) => {
    const url = `postgresql://fixture@${host}:55438/evry_test`;
    expect(assertLocalMigrationDatabase(url, runtime)).toBe(url);
  });
});

describe('migration tool connection isolation', () => {
  const url = 'postgresql://fixture:synthetic@127.0.0.1:55438/evry_test';
  const contaminated = { PGHOSTADDR: 'remote.example.test', PGSERVICE: 'real-service', PGSERVICEFILE: '/shared/config', PGPASSFILE: '/shared/passwords', PGDATABASE: 'real_database' };

  it('starts Docker libpq tools in an empty environment with the explicit synthetic connection', () => {
    const command = buildPgToolCommand('pg_restore', url, ['--list'], { ...contaminated, EVRY_PG_TOOLS_CONTAINER: 'fixture-postgres' });
    expect(command.file).toBe('docker');
    expect(command.args.slice(0, 5)).toEqual(['exec', '-i', 'fixture-postgres', 'env', '-i']);
    expect(command.args).toEqual(expect.arrayContaining(['PGHOST=127.0.0.1', 'PGPORT=55438', 'PGUSER=fixture', 'PGDATABASE=evry_test']));
    expect(command.args.slice(-2)).toEqual(['pg_restore', '--list']);
    expect(command.args.some((arg) => /^PG(HOSTADDR|SERVICE|SERVICEFILE|PASSFILE)=/.test(arg))).toBe(false);
  });

  it('removes inherited libpq overrides from a local binary invocation', () => {
    const command = buildPgToolCommand('pg_dump', url, ['--format=custom'], contaminated);
    for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE']) expect(command.env[key]).toBeUndefined();
    expect(command.env.PGDATABASE).toBe('evry_test');
    expect(command.env.PGHOST).toBe('127.0.0.1');
    expect(command.args).toEqual(['--format=custom']);
  });
});
