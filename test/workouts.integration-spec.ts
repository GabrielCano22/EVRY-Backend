import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Equipment, MuscleGroup } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaConnectionExceptionFilter } from '../src/common/filters/prisma-connection-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ExerciseStatsService } from '../src/modules/workouts/exercise-stats.service';
import { PrismaService } from '../src/prisma/prisma.service';

type FixtureUser = { id: string; email: string; token: string };

describe('workout lifecycle HTTP/PostgreSQL', () => {
  const prefix = `task2-integration-${randomUUID()}`;
  const userIds: string[] = [];
  const exerciseIds: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;

  async function createUser(label: string): Promise<FixtureUser> {
    const email = `${prefix}-${label}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: `${prefix}-${label}`,
        passwordHash: 'not-a-real-password-hash',
      },
    });
    userIds.push(user.id);
    const token = new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).sign({
      sub: user.id,
      email: user.email,
    });
    return { id: user.id, email: user.email, token };
  }

  async function createExercise(
    label: string,
    owner?: FixtureUser,
  ) {
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

  function postWorkout(user: FixtureUser, name: string) {
    return request(app.getHttpServer())
      .post('/api/workouts')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name });
  }

  function postSet(
    user: FixtureUser,
    workoutId: string,
    exerciseId: string,
    values: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
      .post(`/api/workouts/${workoutId}/sets`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        clientMutationId: randomUUID(),
        exerciseId,
        order: 0,
        ...values,
      });
  }

  function finish(user: FixtureUser, workoutId: string) {
    return request(app.getHttpServer())
      .post(`/api/workouts/${workoutId}/finish`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
  }

  function cancel(user: FixtureUser, workoutId: string) {
    return request(app.getHttpServer())
      .post(`/api/workouts/${workoutId}/cancel`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({});
  }

  function removeWorkout(user: FixtureUser, workoutId: string) {
    return request(app.getHttpServer())
      .delete(`/api/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  beforeAll(async () => {
    expect(process.env.TEST_DATABASE_URL).toBeDefined();
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL?.trim());

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new PrismaConnectionExceptionFilter(),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    let cleanupFailure: unknown;
    try {
      if (userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      if (exerciseIds.length > 0) {
        await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
      }
    } catch (error) {
      cleanupFailure ??= error;
    } finally {
      if (app) await app.close();
    }
    if (cleanupFailure) throw cleanupFailure;
  });

  it('collapses two simultaneous starts into one complete active response', async () => {
    const user = await createUser('start-race');

    const [left, right] = await Promise.all([
      postWorkout(user, 'Start left'),
      postWorkout(user, 'Start right'),
    ]);

    expect([left.status, right.status]).toEqual([201, 201]);
    expect(left.body.id).toBe(right.body.id);
    expect(left.body).toMatchObject({
      id: expect.any(String),
      startedAt: expect.any(String),
      endedAt: null,
      cancelledAt: null,
      sets: [],
    });
    await expect(prisma.workout.count({
      where: { userId: user.id, endedAt: null, cancelledAt: null },
    })).resolves.toBe(1);
  });

  it('deduplicates simultaneous set mutations and enforces workout and exercise ownership', async () => {
    const user = await createUser('set-race');
    const other = await createUser('set-race-other');
    const globalExercise = await createExercise('global');
    const ownExercise = await createExercise('own', user);
    const foreignExercise = await createExercise('foreign', other);
    const started = await postWorkout(user, 'Idempotent sets');
    expect(started.status).toBe(201);
    const mutation = randomUUID();
    const payload = {
      clientMutationId: mutation,
      exerciseId: globalExercise.id,
      order: 1,
      reps: 10,
      techniqueStable: true,
    };

    const [left, right] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/workouts/${started.body.id}/sets`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(payload),
      request(app.getHttpServer())
        .post(`/api/workouts/${started.body.id}/sets`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(payload),
    ]);

    expect([left.status, right.status]).toEqual([201, 201]);
    expect(left.body.id).toBe(right.body.id);
    expect(left.body).toMatchObject({
      clientMutationId: mutation,
      exerciseId: globalExercise.id,
      order: 1,
      reps: 10,
      techniqueStable: true,
      isWarmup: false,
      completedAt: expect.any(String),
    });
    await expect(prisma.workoutSet.count({
      where: { workoutId: started.body.id, clientMutationId: mutation },
    })).resolves.toBe(1);

    expect((await postSet(user, started.body.id, ownExercise.id, { reps: 8 })).status).toBe(201);
    expect((await postSet(user, started.body.id, foreignExercise.id, { reps: 8 })).status).toBe(404);
    expect((await postSet(user, started.body.id, 'missing-exercise', { reps: 8 })).status).toBe(404);
    expect((await postSet(other, started.body.id, globalExercise.id, { reps: 8 })).status).toBe(403);
    expect((await postSet(user, 'missing-workout', globalExercise.id, { reps: 8 })).status).toBe(404);
  });

  it('enforces useful sets, terminal immutability, idempotent finish, and idempotent cancel', async () => {
    const user = await createUser('terminal-rules');
    const exercise = await createExercise('terminal-rules-exercise');
    const started = await postWorkout(user, 'Terminal rules');
    const workoutId = started.body.id as string;

    expect((await finish(user, workoutId)).status).toBe(400);
    const weightOnly = await postSet(user, workoutId, exercise.id, { order: 2, weightKg: 100 });
    expect(weightOnly.status).toBe(201);
    expect((await finish(user, workoutId)).status).toBe(400);
    const updated = await request(app.getHttpServer())
      .patch(`/api/workouts/sets/${weightOnly.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ reps: 8 });
    expect(updated.status).toBe(200);
    const earlier = await postSet(user, workoutId, exercise.id, { order: 0, durationS: 30 });
    expect(earlier.status).toBe(201);

    const firstFinish = await finish(user, workoutId);
    const secondFinish = await finish(user, workoutId);
    expect(firstFinish.status).toBe(201);
    expect(secondFinish.status).toBe(201);
    expect(secondFinish.body.endedAt).toBe(firstFinish.body.endedAt);
    expect(firstFinish.body.sets.map((item: { order: number }) => item.order)).toEqual([0, 2]);

    expect((await postSet(user, workoutId, exercise.id, { reps: 1 })).status).toBe(400);
    expect((await request(app.getHttpServer())
      .patch(`/api/workouts/sets/${weightOnly.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ reps: 9 })).status).toBe(400);
    expect((await request(app.getHttpServer())
      .delete(`/api/workouts/sets/${weightOnly.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)).status).toBe(400);
    expect((await request(app.getHttpServer())
      .patch(`/api/workouts/${workoutId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ notes: 'Immutable' })).status).toBe(400);

    const next = await postWorkout(user, 'Cancelled workout');
    const firstCancel = await cancel(user, next.body.id);
    const secondCancel = await cancel(user, next.body.id);
    expect(firstCancel.status).toBe(201);
    expect(secondCancel.status).toBe(201);
    expect(secondCancel.body.cancelledAt).toBe(firstCancel.body.cancelledAt);
    expect((await finish(user, next.body.id)).status).toBe(400);
    expect((await postSet(user, next.body.id, exercise.id, { reps: 1 })).status).toBe(400);
    expect((await request(app.getHttpServer())
      .patch(`/api/workouts/${next.body.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ notes: 'Immutable' })).status).toBe(400);

    const active = await postWorkout(user, 'Active cannot delete');
    expect((await removeWorkout(user, active.body.id)).status).toBe(400);
  });

  it('allows warmup-only completion but creates no derived exercise stat', async () => {
    const user = await createUser('warmup-only');
    const exercise = await createExercise('warmup-only-exercise');
    const started = await postWorkout(user, 'Warmup completion');
    const warmup = await postSet(user, started.body.id, exercise.id, {
      reps: 12,
      isWarmup: true,
    });
    expect(warmup.status).toBe(201);

    const completed = await finish(user, started.body.id);

    expect(completed.status).toBe(201);
    expect(completed.body.endedAt).toEqual(expect.any(String));
    await expect(prisma.exerciseStat.findUnique({
      where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
    })).resolves.toBeNull();
  });

  it('rolls back endedAt when rebuilding stats fails and does not retry the failure', async () => {
    const user = await createUser('stats-failure');
    const exercise = await createExercise('stats-failure-exercise');
    const started = await postWorkout(user, 'Stats rollback');
    expect((await postSet(user, started.body.id, exercise.id, { reps: 8 })).status).toBe(201);
    const stats = app.get(ExerciseStatsService);
    const failure = jest.spyOn(stats, 'rebuildExerciseStats').mockRejectedValueOnce(new Error('forced stats failure'));

    const response = await finish(user, started.body.id);

    expect(response.status).toBe(500);
    expect(failure).toHaveBeenCalledTimes(1);
    await expect(prisma.workout.findUnique({ where: { id: started.body.id } }))
      .resolves.toMatchObject({ endedAt: null, cancelledAt: null });
    failure.mockRestore();
  });

  it('rebuilds exact records after finishing and after deleting historical sessions', async () => {
    const user = await createUser('stats-rebuild');
    const exercise = await createExercise('stats-rebuild-exercise');
    const first = await postWorkout(user, 'Stats first');
    const firstWeight = await postSet(user, first.body.id, exercise.id, { order: 0, weightKg: 80, reps: 5 });
    const firstReps = await postSet(user, first.body.id, exercise.id, { order: 1, weightKg: 40, reps: 15 });
    expect(firstWeight.status).toBe(201);
    expect(firstReps.status).toBe(201);
    expect((await finish(user, first.body.id)).status).toBe(201);

    const second = await postWorkout(user, 'Stats second');
    const bestWeight = await postSet(user, second.body.id, exercise.id, { order: 0, weightKg: 100, reps: 1 });
    const bestReps = await postSet(user, second.body.id, exercise.id, { order: 1, weightKg: 50, reps: 20 });
    const bestEpley = await postSet(user, second.body.id, exercise.id, { order: 2, weightKg: 90, reps: 8 });
    expect((await finish(user, second.body.id)).status).toBe(201);

    await expect(prisma.exerciseStat.findUniqueOrThrow({
      where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
    })).resolves.toMatchObject({
      estimated1RM: 114,
      bestWeight: 100,
      bestReps: 20,
      sessionsCount: 2,
      trendSlope: 0,
      bestWeightAt: new Date(bestWeight.body.completedAt),
      bestRepsWeightKg: 50,
      bestRepsAt: new Date(bestReps.body.completedAt),
      estimated1RMAt: new Date(bestEpley.body.completedAt),
      estimated1RMWeightKg: 90,
      estimated1RMReps: 8,
    });

    expect((await removeWorkout(user, second.body.id)).body).toEqual({ ok: true });
    await expect(prisma.exerciseStat.findUniqueOrThrow({
      where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
    })).resolves.toMatchObject({
      estimated1RM: 80 * (1 + 5 / 30),
      bestWeight: 80,
      bestReps: 15,
      sessionsCount: 1,
      bestWeightAt: new Date(firstWeight.body.completedAt),
      bestRepsWeightKg: 40,
      bestRepsAt: new Date(firstReps.body.completedAt),
    });

    expect((await removeWorkout(user, first.body.id)).body).toEqual({ ok: true });
    await expect(prisma.exerciseStat.findUnique({
      where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
    })).resolves.toBeNull();
  });

  it('serializes add-set against finish and leaves a final immutable snapshot', async () => {
    const user = await createUser('race-add-finish');
    const exercise = await createExercise('race-add-finish-exercise');
    const started = await postWorkout(user, 'Add finish race');
    expect((await postSet(user, started.body.id, exercise.id, { reps: 5 })).status).toBe(201);

    const [added, finished] = await Promise.all([
      postSet(user, started.body.id, exercise.id, { order: 1, reps: 6 }),
      finish(user, started.body.id),
    ]);

    expect(finished.status).toBe(201);
    expect([201, 400]).toContain(added.status);
    const persisted = await prisma.workout.findUniqueOrThrow({
      where: { id: started.body.id },
      include: { sets: true },
    });
    expect(persisted.endedAt).not.toBeNull();
    expect(persisted.cancelledAt).toBeNull();
    expect(persisted.sets).toHaveLength(added.status === 201 ? 2 : 1);
  });

  it.each(['update', 'delete'])('serializes set %s against finish', async (operation) => {
    const user = await createUser(`race-${operation}-finish`);
    const exercise = await createExercise(`race-${operation}-finish-exercise`);
    const started = await postWorkout(user, `${operation} finish race`);
    const base = await postSet(user, started.body.id, exercise.id, { reps: 5 });
    const target = await postSet(user, started.body.id, exercise.id, { order: 1, reps: 6 });
    expect(base.status).toBe(201);
    expect(target.status).toBe(201);

    const mutation = operation === 'update'
      ? request(app.getHttpServer())
        .patch(`/api/workouts/sets/${target.body.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ reps: 12 })
      : request(app.getHttpServer())
        .delete(`/api/workouts/sets/${target.body.id}`)
        .set('Authorization', `Bearer ${user.token}`);
    const [mutated, finished] = await Promise.all([mutation, finish(user, started.body.id)]);

    expect(finished.status).toBe(201);
    expect([200, 400]).toContain(mutated.status);
    const persisted = await prisma.workout.findUniqueOrThrow({
      where: { id: started.body.id },
      include: { sets: true },
    });
    expect(persisted.endedAt).not.toBeNull();
    const targetAfter = persisted.sets.find(({ id }) => id === target.body.id);
    if (operation === 'delete' && mutated.status === 200) expect(targetAfter).toBeUndefined();
    if (operation === 'update' && mutated.status === 200) expect(targetAfter?.reps).toBe(12);
    if (mutated.status === 400) expect(targetAfter?.reps).toBe(6);
  });

  it('serializes finish against cancel so exactly one terminal state wins', async () => {
    const user = await createUser('race-finish-cancel');
    const exercise = await createExercise('race-finish-cancel-exercise');
    const started = await postWorkout(user, 'Finish cancel race');
    expect((await postSet(user, started.body.id, exercise.id, { reps: 5 })).status).toBe(201);

    const [finished, cancelled] = await Promise.all([
      finish(user, started.body.id),
      cancel(user, started.body.id),
    ]);

    expect([finished.status, cancelled.status].sort()).toEqual([201, 400]);
    const persisted = await prisma.workout.findUniqueOrThrow({ where: { id: started.body.id } });
    expect(Boolean(persisted.endedAt) !== Boolean(persisted.cancelledAt)).toBe(true);
    const stat = await prisma.exerciseStat.findUnique({
      where: { userId_exerciseId: { userId: user.id, exerciseId: exercise.id } },
    });
    expect(Boolean(stat)).toBe(Boolean(persisted.endedAt));
  });

  it('serializes active delete against finish and double delete of a historical workout', async () => {
    const user = await createUser('race-historical-delete');
    const exercise = await createExercise('race-historical-delete-exercise');
    const started = await postWorkout(user, 'Delete finish race');
    expect((await postSet(user, started.body.id, exercise.id, { reps: 5 })).status).toBe(201);

    const [finished, removed] = await Promise.all([
      finish(user, started.body.id),
      removeWorkout(user, started.body.id),
    ]);

    expect(finished.status).toBe(201);
    expect([200, 400]).toContain(removed.status);
    const afterRace = await prisma.workout.findUnique({ where: { id: started.body.id } });
    if (removed.status === 200) expect(afterRace).toBeNull();
    else expect(afterRace?.endedAt).not.toBeNull();

    const historical = await postWorkout(user, 'Historical double delete');
    expect((await postSet(user, historical.body.id, exercise.id, { reps: 6 })).status).toBe(201);
    expect((await finish(user, historical.body.id)).status).toBe(201);
    const [left, right] = await Promise.all([
      removeWorkout(user, historical.body.id),
      removeWorkout(user, historical.body.id),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 404]);
    await expect(prisma.workout.findUnique({ where: { id: historical.body.id } })).resolves.toBeNull();
  });
});
