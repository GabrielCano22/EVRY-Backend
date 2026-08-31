import { assertSafeTestDatabase } from './guard-test-database';
import { createPrismaClient } from '../src/prisma/prisma-client';
import { randomUUID } from 'node:crypto';

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

describe('release invariants database migration', () => {
  const prisma = createPrismaClient();
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('instala columnas e índices y permite solo una sesión activa por usuario', async () => {
    const uniqueValue = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `task6-${uniqueValue}@example.test`,
        name: 'Task 6 migration test',
        passwordHash: 'not-a-real-password-hash',
      },
    });
    userId = user.id;

    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name = 'Workout' AND column_name = 'cancelledAt'
          OR table_name = 'WorkoutSet' AND column_name IN ('clientMutationId', 'techniqueStable'))
    `;
    expect(columns).toEqual(expect.arrayContaining([
      { table_name: 'Workout', column_name: 'cancelledAt' },
      { table_name: 'WorkoutSet', column_name: 'clientMutationId' },
      { table_name: 'WorkoutSet', column_name: 'techniqueStable' },
    ]));

    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'Workout_userId_status_active_unique',
          'Workout_userId_endedAt_id_idx',
          'WorkoutSet_workoutId_clientMutationId_key',
          'WorkoutSet_exerciseId_workoutId_completedAt_idx'
        )
    `;
    expect(indexes.map(({ indexname }) => indexname)).toEqual(expect.arrayContaining([
      'Workout_userId_status_active_unique',
      'Workout_userId_endedAt_id_idx',
      'WorkoutSet_workoutId_clientMutationId_key',
      'WorkoutSet_exerciseId_workoutId_completedAt_idx',
    ]));
    expect(indexes.find(({ indexname }) => indexname === 'Workout_userId_status_active_unique')?.indexdef)
      .toContain('WHERE (status = \'ACTIVE\'::"WorkoutStatus")');

    await prisma.workout.create({ data: { userId, name: 'Active workout' } });
    await expect(
      prisma.workout.create({ data: { userId, name: 'Second active workout' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.workout.create({
        data: { userId, name: 'Cancelled workout', status: 'CANCELLED', cancelledAt: new Date() },
      }),
    ).resolves.toMatchObject({ cancelledAt: expect.any(Date) });
  });
});
