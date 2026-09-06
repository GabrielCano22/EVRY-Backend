import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Equipment, MuscleGroup, WorkoutStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { createIntegrationApp } from './helpers/create-integration-app';
import { PrismaService } from '../src/prisma/prisma.service';

type FixtureUser = { id: string; email: string; token: string };
type SyncSet = {
  clientId: string;
  baseRevision: number;
  exerciseId: string;
  order: number;
  weightKg?: number;
  reps?: number;
  durationS?: number;
  isWarmup?: boolean;
  techniqueStable?: boolean;
  completedAt?: string;
};
type SyncPayload = {
  clientId: string;
  syncId: string;
  baseRevision: number;
  name: string;
  startedAt: string;
  endedAt?: string;
  cancelledAt?: string;
  status: WorkoutStatus;
  notes?: string;
  sets: SyncSet[];
  deletedSetClientIds: string[];
};
type AdvisoryLockIdentity = {
  pid: string;
  databaseId: string;
  classId: string;
  objectId: string;
  objectSubId: string;
};

function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) throw new Error('TEST_DATABASE_URL must be configured for this integration test.');
  return url;
}

async function lockWorkoutLifecycleBarrier(
  client: Client,
  userId: string,
): Promise<AdvisoryLockIdentity> {
  await client.query('BEGIN');
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`evry:workout-lifecycle:${userId}`],
  );
  const locks = await client.query<AdvisoryLockIdentity>(`
    SELECT l.pid::text AS pid,
      l.database::text AS "databaseId",
      l.classid::text AS "classId",
      l.objid::text AS "objectId",
      l.objsubid::text AS "objectSubId"
    FROM pg_locks AS l
    WHERE l.pid = pg_backend_pid()
      AND l.locktype = 'advisory'
      AND l.granted
  `);
  if (locks.rows.length !== 1) {
    throw new Error(`Expected one granted lifecycle advisory lock, got ${JSON.stringify(locks.rows)}.`);
  }
  return locks.rows[0];
}

async function waitForSyncLockWaiters(
  client: Client,
  lock: AdvisoryLockIdentity,
  expectedWaiters: number,
): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const result = await client.query<{ pid: string }>(`
      SELECT l.pid::text AS pid
      FROM pg_locks AS l
      WHERE l.locktype = 'advisory'
        AND NOT l.granted
        AND l.database::text = $1
        AND l.classid::text = $2
        AND l.objid::text = $3
        AND l.objsubid::text = $4
      ORDER BY l.pid
    `, [lock.databaseId, lock.classId, lock.objectId, lock.objectSubId]);
    const waiterPids = result.rows.map(({ pid }) => pid);
    if (
      waiterPids.length === expectedWaiters
      && new Set(waiterPids).size === expectedWaiters
      && waiterPids.every((pid) => pid !== lock.pid)
    ) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  const matchingLocks = await client.query<{
    pid: string;
    granted: boolean;
    mode: string;
    waitEventType: string | null;
    waitEvent: string | null;
  }>(`
    SELECT l.pid::text AS pid,
      l.granted,
      l.mode,
      a.wait_event_type AS "waitEventType",
      a.wait_event AS "waitEvent"
    FROM pg_locks AS l
    JOIN pg_stat_activity AS a ON a.pid = l.pid
    WHERE l.locktype = 'advisory'
      AND l.database::text = $1
      AND l.classid::text = $2
      AND l.objid::text = $3
      AND l.objsubid::text = $4
    ORDER BY l.granted DESC, l.pid
  `, [lock.databaseId, lock.classId, lock.objectId, lock.objectSubId]);
  throw new Error(
    `Timed out waiting for exactly ${expectedWaiters} sync transactions at lifecycle lock ${JSON.stringify(lock)}: ${JSON.stringify(matchingLocks.rows)}`,
  );
}

describe('offline workout synchronization HTTP/PostgreSQL', () => {
  const prefix = `task2-sync-${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];
  const exerciseIds: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;

  async function createUser(label: string): Promise<FixtureUser> {
    const email = `${prefix}-${label}@example.test`;
    const user = await prisma.user.create({
      data: { email, name: `${prefix}-${label}`, passwordHash: 'not-a-real-password-hash' },
    });
    userIds.push(user.id);
    const token = new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).sign({
      sub: user.id,
      email: user.email,
    });
    return { id: user.id, email: user.email, token };
  }

  async function createExercise(label: string, owner?: FixtureUser) {
    const exercise = await prisma.exercise.create({
      data: {
        name: `${prefix}-${label}`,
        muscleGroup: MuscleGroup.CORE,
        equipment: Equipment.BODYWEIGHT,
        isCustom: Boolean(owner),
        ownerId: owner?.id,
      },
    });
    exerciseIds.push(exercise.id);
    return exercise;
  }

  function sync(user: FixtureUser, payload: SyncPayload) {
    return request(app.getHttpServer())
      .post('/api/v1/sync/workouts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(payload);
  }

  function startSync(user: FixtureUser, payload: SyncPayload): Promise<request.Response> {
    return sync(user, payload).then((response) => response);
  }

  function activePayload(
    exerciseId: string,
    overrides: Partial<SyncPayload> = {},
  ): SyncPayload {
    return {
      clientId: randomUUID(),
      syncId: randomUUID(),
      baseRevision: 0,
      name: 'Sesión offline',
      startedAt: '2026-08-31T12:00:00.000Z',
      status: WorkoutStatus.ACTIVE,
      sets: [{
        clientId: randomUUID(),
        baseRevision: 0,
        exerciseId,
        order: 0,
        reps: 5,
        weightKg: 50,
        completedAt: '2026-08-31T12:05:00.000Z',
      }],
      deletedSetClientIds: [],
      ...overrides,
    };
  }

  beforeAll(async () => {
    expect(process.env.TEST_DATABASE_URL).toBeDefined();
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL?.trim());
    app = await createIntegrationApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    let cleanupFailure: unknown;
    try {
      if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      if (exerciseIds.length > 0) await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
    } catch (error) {
      cleanupFailure ??= error;
    } finally {
      await app?.close();
    }
    if (cleanupFailure) throw cleanupFailure;
  });

  it('persists a finished offline batch once and returns its canonical statistics on replay', async () => {
    const user = await createUser('finished-replay');
    const exercise = await createExercise('finished-replay');
    const firstSetId = randomUUID();
    const secondSetId = randomUUID();
    const payload = activePayload(exercise.id, {
      name: 'Finalizada sin red',
      status: WorkoutStatus.COMPLETED,
      endedAt: '2026-08-31T12:30:00.000Z',
      sets: [
        {
          clientId: firstSetId, baseRevision: 0, exerciseId: exercise.id, order: 0,
          weightKg: 80, reps: 5, completedAt: '2026-08-31T12:10:00.000Z',
        },
        {
          clientId: secondSetId, baseRevision: 0, exerciseId: exercise.id, order: 1,
          weightKg: 50, reps: 12, completedAt: '2026-08-31T12:20:00.000Z',
        },
      ],
    });

    const first = await sync(user, payload);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      revision: 1,
      workout: {
        id: expect.any(String), clientId: payload.clientId, revision: 1,
        status: 'COMPLETED', endedAt: payload.endedAt, cancelledAt: null,
      },
      mapping: {
        workout: { clientId: payload.clientId, serverId: expect.any(String) },
        sets: expect.arrayContaining([
          { clientId: firstSetId, serverId: expect.any(String), revision: 1 },
          { clientId: secondSetId, serverId: expect.any(String), revision: 1 },
        ]),
      },
    });
    const workoutId = first.body.workout.id as string;
    const mappings = first.body.mapping.sets as Array<{ clientId: string; serverId: string }>;

    const replay = await sync(user, payload);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({
      revision: 1,
      workout: { id: workoutId, revision: 1, status: 'COMPLETED' },
      mapping: { workout: { serverId: workoutId }, sets: mappings },
    });
    await expect(prisma.workout.findUniqueOrThrow({
      where: { id: workoutId }, include: { sets: { orderBy: { order: 'asc' } } },
    })).resolves.toMatchObject({
      userId: user.id, clientId: payload.clientId, lastSyncId: payload.syncId,
      revision: 1, status: 'COMPLETED', sets: [
        { clientId: firstSetId, order: 0, weightKg: 80, reps: 5, revision: 1 },
        { clientId: secondSetId, order: 1, weightKg: 50, reps: 12, revision: 1 },
      ],
    });
    await expect(prisma.workout.count({ where: { userId: user.id, clientId: payload.clientId } }))
      .resolves.toBe(1);
    await expect(prisma.workoutSet.count({ where: { workoutId } })).resolves.toBe(2);
    await expect(prisma.exerciseStat.findUniqueOrThrow({
      where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
    })).resolves.toMatchObject({
      estimated1RM: 93.33333333333334,
      bestWeight: 80,
      bestReps: 12,
      sessionsCount: 1,
      bestWeightAt: new Date('2026-08-31T12:10:00.000Z'),
      bestRepsWeightKg: 50,
      bestRepsAt: new Date('2026-08-31T12:20:00.000Z'),
      estimated1RMAt: new Date('2026-08-31T12:10:00.000Z'),
      estimated1RMWeightKg: 80,
      estimated1RMReps: 5,
    });
  });

  it('makes simultaneous delivery of one offline batch idempotent in PostgreSQL', async () => {
    const user = await createUser('same-batch-race');
    const exercise = await createExercise('same-batch-race');
    const payload = activePayload(exercise.id, {
      status: WorkoutStatus.COMPLETED,
      endedAt: '2026-08-31T13:30:00.000Z',
    });

    const barrier = new Client({ connectionString: testDatabaseUrl() });
    const observer = new Client({ connectionString: testDatabaseUrl() });
    let deliveries: Array<Promise<request.Response>> = [];
    await barrier.connect();
    try {
      await observer.connect();
      const lock = await lockWorkoutLifecycleBarrier(barrier, user.id);
      const left = startSync(user, payload);
      deliveries = [left];
      await waitForSyncLockWaiters(observer, lock, 1);
      const right = startSync(user, payload);
      deliveries = [left, right];
      await waitForSyncLockWaiters(observer, lock, 2);
      await barrier.query('COMMIT');

      const [leftResponse, rightResponse] = await Promise.all(deliveries);
      expect([leftResponse.status, rightResponse.status]).toEqual([201, 201]);
      expect(leftResponse.body).toMatchObject({
        revision: 1,
        workout: { id: rightResponse.body.workout.id, revision: 1, status: 'COMPLETED' },
        mapping: { workout: { serverId: rightResponse.body.mapping.workout.serverId } },
      });
      await expect(prisma.workout.count({ where: { userId: user.id, clientId: payload.clientId } }))
        .resolves.toBe(1);
      await expect(prisma.workoutSet.count({ where: { workoutId: leftResponse.body.workout.id } })).resolves.toBe(1);
    } finally {
      await barrier.query('ROLLBACK').catch(() => undefined);
      await Promise.allSettled(deliveries);
      await observer.end();
      await barrier.end();
    }
  }, 15_000);

  it('accepts one concurrent revision and returns the canonical server version to the stale device', async () => {
    const user = await createUser('revision-race');
    const exercise = await createExercise('revision-race');
    const initialPayload = activePayload(exercise.id);
    const initial = await sync(user, initialPayload);
    expect(initial.status).toBe(201);
    const initialSet = initialPayload.sets[0];
    const payload = {
      ...initialPayload,
      baseRevision: 1,
      syncId: randomUUID(),
      name: 'Cambio dispositivo A',
      sets: [{ ...initialSet, baseRevision: 1, reps: 9 }],
    };
    const rival = { ...payload, syncId: randomUUID(), name: 'Cambio dispositivo B', sets: [{ ...initialSet, baseRevision: 1, reps: 11 }] };

    const barrier = new Client({ connectionString: testDatabaseUrl() });
    const observer = new Client({ connectionString: testDatabaseUrl() });
    let deliveries: Array<Promise<request.Response>> = [];
    await barrier.connect();
    try {
      await observer.connect();
      const lock = await lockWorkoutLifecycleBarrier(barrier, user.id);
      const left = startSync(user, payload);
      deliveries = [left];
      await waitForSyncLockWaiters(observer, lock, 1);
      const right = startSync(user, rival);
      deliveries = [left, right];
      await waitForSyncLockWaiters(observer, lock, 2);
      await barrier.query('COMMIT');

      const [leftResponse, rightResponse] = await Promise.all(deliveries);
      const accepted = leftResponse.status === 201 ? leftResponse : rightResponse;
      const rejected = leftResponse.status === 409 ? leftResponse : rightResponse;
      expect([leftResponse.status, rightResponse.status].sort()).toEqual([201, 409]);
      expect(accepted.body).toMatchObject({ revision: 2, workout: { revision: 2, status: 'ACTIVE' } });
      expect(rejected.body).toMatchObject({
        code: 'REVISION_CONFLICT', retryable: false,
        serverVersion: { id: accepted.body.workout.id, revision: 2, name: accepted.body.workout.name },
      });
      const stored = await prisma.workout.findUniqueOrThrow({
        where: { id: accepted.body.workout.id }, include: { sets: true },
      });
      expect(stored).toMatchObject({ revision: 2, name: accepted.body.workout.name });
      expect(stored.sets).toEqual(expect.arrayContaining([
        expect.objectContaining({ clientId: initialSet.clientId, revision: 2, reps: accepted.body.workout.sets[0].reps }),
      ]));
    } finally {
      await barrier.query('ROLLBACK').catch(() => undefined);
      await Promise.allSettled(deliveries);
      await observer.end();
      await barrier.end();
    }
  }, 15_000);

  it('rejects a second active offline session instead of mixing it with the existing one', async () => {
    const user = await createUser('different-active');
    const exercise = await createExercise('different-active');
    const active = await prisma.workout.create({
      data: { userId: user.id, name: 'Sesión activa existente', status: WorkoutStatus.ACTIVE },
    });
    const payload = activePayload(exercise.id, { name: 'Otra sesión activa offline' });

    const response = await sync(user, payload);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'ACTIVE_WORKOUT_CONFLICT',
      retryable: false,
      serverVersion: { id: active.id, status: 'ACTIVE', name: 'Sesión activa existente' },
    });
    await expect(prisma.workout.findUniqueOrThrow({ where: { id: active.id }, include: { sets: true } }))
      .resolves.toMatchObject({ status: 'ACTIVE', name: 'Sesión activa existente', revision: 1, sets: [] });
    await expect(prisma.workout.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: payload.clientId } },
    })).resolves.toBeNull();
  });

  it('updates, deletes and reorders existing sets as one active synchronization', async () => {
    const user = await createUser('set-replacement');
    const exercise = await createExercise('set-replacement');
    const firstId = randomUUID();
    const removedId = randomUUID();
    const thirdId = randomUUID();
    const initialPayload = activePayload(exercise.id, {
      sets: [
        { clientId: firstId, baseRevision: 0, exerciseId: exercise.id, order: 0, reps: 5, weightKg: 30 },
        { clientId: removedId, baseRevision: 0, exerciseId: exercise.id, order: 1, reps: 6, weightKg: 35 },
        { clientId: thirdId, baseRevision: 0, exerciseId: exercise.id, order: 2, reps: 7, weightKg: 40 },
      ],
    });
    const initial = await sync(user, initialPayload);
    expect(initial.status).toBe(201);
    const replacement: SyncPayload = {
      ...initialPayload,
      syncId: randomUUID(),
      baseRevision: 1,
      sets: [
        { clientId: firstId, baseRevision: 1, exerciseId: exercise.id, order: 2, reps: 9, weightKg: 45 },
        { clientId: thirdId, baseRevision: 1, exerciseId: exercise.id, order: 0, reps: 12, weightKg: 40 },
      ],
      deletedSetClientIds: [removedId],
    };

    const updated = await sync(user, replacement);
    expect(updated.status).toBe(201);
    expect(updated.body).toMatchObject({ revision: 2, workout: { revision: 2 } });
    await expect(prisma.workout.findUniqueOrThrow({
      where: { id: initial.body.workout.id }, include: { sets: { orderBy: { order: 'asc' } } },
    })).resolves.toMatchObject({
      revision: 2,
      lastSyncId: replacement.syncId,
      sets: [
        { clientId: thirdId, order: 0, reps: 12, weightKg: 40, revision: 2 },
        { clientId: firstId, order: 2, reps: 9, weightKg: 45, revision: 2 },
      ],
    });
    await expect(prisma.workoutSet.count({ where: { workoutId: initial.body.workout.id, clientId: removedId } }))
      .resolves.toBe(0);
  });

  it('rejects a foreign exercise before creating any part of the offline batch', async () => {
    const user = await createUser('foreign-exercise');
    const other = await createUser('foreign-exercise-owner');
    const ownExercise = await createExercise('foreign-exercise-global');
    const foreignExercise = await createExercise('foreign-exercise-private', other);
    const payload = activePayload(ownExercise.id, {
      sets: [
        { clientId: randomUUID(), baseRevision: 0, exerciseId: ownExercise.id, order: 0, reps: 4 },
        { clientId: randomUUID(), baseRevision: 0, exerciseId: foreignExercise.id, order: 1, reps: 5 },
      ],
    });

    const response = await sync(user, payload);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'NOT_FOUND', retryable: false, requestId: expect.any(String),
    });
    await expect(prisma.workout.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: payload.clientId } },
    })).resolves.toBeNull();
    await expect(prisma.workoutSet.count({ where: { exerciseId: ownExercise.id } })).resolves.toBe(0);
    await expect(prisma.exerciseStat.findUnique({
      where: { userId_exerciseId: { userId: user.id, exerciseId: ownExercise.id } },
    })).resolves.toBeNull();
  });

  it('rolls back earlier set operations when a later set revision conflicts', async () => {
    const user = await createUser('late-conflict');
    const exercise = await createExercise('late-conflict');
    const firstId = randomUUID();
    const secondId = randomUUID();
    const initialPayload = activePayload(exercise.id, {
      name: 'Antes del conflicto',
      sets: [
        { clientId: firstId, baseRevision: 0, exerciseId: exercise.id, order: 0, reps: 5, weightKg: 30 },
        { clientId: secondId, baseRevision: 0, exerciseId: exercise.id, order: 1, reps: 6, weightKg: 35 },
      ],
    });
    const initial = await sync(user, initialPayload);
    expect(initial.status).toBe(201);
    const conflict: SyncPayload = {
      ...initialPayload,
      syncId: randomUUID(),
      baseRevision: 1,
      name: 'No debe persistir',
      sets: [
        { clientId: firstId, baseRevision: 1, exerciseId: exercise.id, order: 1, reps: 99, weightKg: 99 },
        { clientId: secondId, baseRevision: 0, exerciseId: exercise.id, order: 0, reps: 88, weightKg: 88 },
      ],
    };

    const response = await sync(user, conflict);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'REVISION_CONFLICT', serverVersion: { revision: 1, name: 'Antes del conflicto' } });
    await expect(prisma.workout.findUniqueOrThrow({
      where: { id: initial.body.workout.id }, include: { sets: { orderBy: { order: 'asc' } } },
    })).resolves.toMatchObject({
      revision: 1,
      name: 'Antes del conflicto',
      lastSyncId: initialPayload.syncId,
      sets: [
        { clientId: firstId, order: 0, reps: 5, weightKg: 30, revision: 1 },
        { clientId: secondId, order: 1, reps: 6, weightKg: 35, revision: 1 },
      ],
    });
  });

  it.each([WorkoutStatus.COMPLETED, WorkoutStatus.CANCELLED])(
    'blocks later synchronization of a %s workout without mutating its rows',
    async (status) => {
      const user = await createUser(`terminal-${status.toLowerCase()}`);
      const exercise = await createExercise(`terminal-${status.toLowerCase()}`);
      const initialPayload = activePayload(exercise.id, {
        status,
        ...(status === WorkoutStatus.COMPLETED
          ? { endedAt: '2026-08-31T15:00:00.000Z' }
          : { cancelledAt: '2026-08-31T15:00:00.000Z' }),
      });
      const initial = await sync(user, initialPayload);
      expect(initial.status).toBe(201);
      const blocked = await sync(user, {
        ...initialPayload,
        syncId: randomUUID(),
        baseRevision: 1,
        name: 'Cambio bloqueado',
        sets: initialPayload.sets.map((set) => ({ ...set, baseRevision: 1, reps: 99 })),
      });
      expect(blocked.status).toBe(400);
      expect(blocked.body).toMatchObject({
        code: 'BAD_REQUEST', retryable: false, requestId: expect.any(String),
      });
      await expect(prisma.workout.findUniqueOrThrow({
        where: { id: initial.body.workout.id }, include: { sets: true },
      })).resolves.toMatchObject({
        revision: 1,
        name: 'Sesión offline',
        status,
        lastSyncId: initialPayload.syncId,
        sets: [expect.objectContaining({ reps: 5, revision: 1 })],
      });
    },
  );

  it('rejects an empty completion before leaving a workout or derived statistics', async () => {
    const user = await createUser('empty-completion');
    const exercise = await createExercise('empty-completion');
    const payload = activePayload(exercise.id, {
      status: WorkoutStatus.COMPLETED,
      endedAt: '2026-08-31T16:00:00.000Z',
      sets: [],
    });

    const response = await sync(user, payload);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'BAD_REQUEST', retryable: false });
    await expect(prisma.workout.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: payload.clientId } },
    })).resolves.toBeNull();
    await expect(prisma.exerciseStat.findUnique({
      where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
    })).resolves.toBeNull();
  });
});
