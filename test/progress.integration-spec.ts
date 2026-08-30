import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Equipment, MuscleGroup } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { formatCivilDate } from '../src/common/dates/civil-date';
import { PrismaConnectionExceptionFilter } from '../src/common/filters/prisma-connection-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { resolveProgressPeriod } from '../src/modules/progress/progress-period';
import { PrismaService } from '../src/prisma/prisma.service';

type FixtureUser = { id: string; email: string; token: string };
type FixtureExercise = { id: string; name: string };
type SetInput = {
  id?: string;
  order?: number;
  weightKg?: number | null;
  reps?: number | null;
  durationS?: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
  completedAt?: Date;
};

describe('progress HTTP/PostgreSQL', () => {
  const prefix = `task3-progress-${randomUUID()}`;
  const userIds: string[] = [];
  const exerciseIds: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;
  let user: FixtureUser;
  let other: FixtureUser;
  let globalExercise: FixtureExercise;
  let emptyExercise: FixtureExercise;
  let ownExercise: FixtureExercise;
  let foreignExercise: FixtureExercise;
  let backExercise: FixtureExercise;
  let currentWorkoutOneId: string;
  let currentWorkoutTwoId: string;
  let currentWorkoutTwoEndedAt: Date;

  function addMilliseconds(value: Date, amount: number): Date {
    return new Date(value.getTime() + amount);
  }

  async function createUser(label: string): Promise<FixtureUser> {
    const created = await prisma.user.create({
      data: {
        email: `${prefix}-${label}@example.test`,
        name: `${prefix}-${label}`,
        passwordHash: 'not-a-real-password-hash',
      },
    });
    userIds.push(created.id);
    return {
      id: created.id,
      email: created.email,
      token: new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).sign({
        sub: created.id,
        email: created.email,
      }),
    };
  }

  async function createExercise(
    label: string,
    muscleGroup: MuscleGroup,
    owner?: FixtureUser,
  ): Promise<FixtureExercise> {
    const created = await prisma.exercise.create({
      data: {
        name: `${prefix}-${label}`,
        muscleGroup,
        equipment: Equipment.BODYWEIGHT,
        isCustom: Boolean(owner),
        ownerId: owner?.id,
      },
    });
    exerciseIds.push(created.id);
    return { id: created.id, name: created.name };
  }

  async function createWorkout(
    owner: FixtureUser,
    label: string,
    endedAt: Date | null,
    sets: Array<{ exercise: FixtureExercise; values: SetInput }>,
    cancelledAt: Date | null = null,
  ): Promise<string> {
    const anchor = endedAt ?? new Date();
    const workout = await prisma.workout.create({
      data: {
        userId: owner.id,
        name: `${prefix}-${label}`,
        startedAt: addMilliseconds(anchor, -3_600_000),
        endedAt,
        cancelledAt,
        status: cancelledAt ? 'CANCELLED' : endedAt ? 'COMPLETED' : 'ACTIVE',
      },
    });
    for (const [index, item] of sets.entries()) {
      await prisma.workoutSet.create({
        data: {
          id: item.values.id,
          workoutId: workout.id,
          exerciseId: item.exercise.id,
          order: item.values.order ?? index,
          weightKg: item.values.weightKg,
          reps: item.values.reps,
          durationS: item.values.durationS,
          rpe: item.values.rpe,
          isWarmup: item.values.isWarmup ?? false,
          completedAt: item.values.completedAt ?? addMilliseconds(anchor, -600_000 + index),
          clientMutationId: randomUUID(),
        },
      });
    }
    return workout.id;
  }

  function get(path: string, actor: FixtureUser = user) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${actor.token}`);
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

    user = await createUser('owner');
    other = await createUser('other');
    globalExercise = await createExercise('press', MuscleGroup.CHEST);
    emptyExercise = await createExercise('empty', MuscleGroup.CORE);
    ownExercise = await createExercise('own', MuscleGroup.SHOULDERS, user);
    foreignExercise = await createExercise('foreign', MuscleGroup.QUADS, other);
    backExercise = await createExercise('back', MuscleGroup.BACK);

    const now = new Date();
    const period30 = resolveProgressPeriod('30d', now);
    const period90 = resolveProgressPeriod('90d', now);
    const period6m = resolveProgressPeriod('6m', now);
    const period1y = resolveProgressPeriod('1y', now);
    if (
      !period30.fromInclusive
      || !period30.previous
      || !period90.fromInclusive
      || !period6m.fromInclusive
      || !period1y.fromInclusive
    ) throw new Error('Expected finite progress periods for fixtures.');

    const currentOneEnded = addMilliseconds(period30.toExclusive, -3 * 86_400_000 + 7 * 3_600_000);
    currentWorkoutTwoEndedAt = addMilliseconds(period30.toExclusive, -2 * 86_400_000 + 7 * 3_600_000);
    const backEnded = addMilliseconds(period30.toExclusive, -86_400_000 + 7 * 3_600_000);
    const emptyEnded = addMilliseconds(period30.toExclusive, -86_400_000 + 9 * 3_600_000);
    const loadTieAt = addMilliseconds(currentWorkoutTwoEndedAt, -600_000);

    currentWorkoutOneId = await createWorkout(user, 'current-one', currentOneEnded, [
      { exercise: globalExercise, values: { id: `${prefix}-load-a`, order: 0, weightKg: 100, reps: 1 } },
      { exercise: globalExercise, values: { id: `${prefix}-reps`, order: 1, weightKg: null, reps: 20 } },
      { exercise: globalExercise, values: { order: 2, weightKg: 150, reps: 2, isWarmup: true } },
      { exercise: globalExercise, values: { order: 3, weightKg: 200, reps: 0, durationS: 0 } },
    ]);
    currentWorkoutTwoId = await createWorkout(user, 'current-two', currentWorkoutTwoEndedAt, [
      {
        exercise: globalExercise,
        values: { id: `${prefix}-load-z`, order: 0, weightKg: 100, reps: 1, completedAt: loadTieAt },
      },
      { exercise: globalExercise, values: { id: `${prefix}-epley`, order: 1, weightKg: 90, reps: 8 } },
    ]);
    await createWorkout(user, 'back-current', backEnded, [
      { exercise: backExercise, values: { weightKg: 40, reps: 10 } },
    ]);
    await createWorkout(user, 'empty-current', emptyEnded, []);

    await createWorkout(user, 'previous-30', addMilliseconds(period30.previous.fromInclusive, 86_400_000), [
      { exercise: globalExercise, values: { weightKg: 50, reps: 10 } },
    ]);
    await createWorkout(user, 'current-90-only', addMilliseconds(period90.fromInclusive, 86_400_000), [
      { exercise: globalExercise, values: { weightKg: 60, reps: 10 } },
    ]);
    await createWorkout(user, 'current-6m-only', addMilliseconds(period6m.fromInclusive, 86_400_000), [
      { exercise: globalExercise, values: { weightKg: 70, reps: 8 } },
    ]);
    await createWorkout(user, 'current-1y-only', addMilliseconds(period1y.fromInclusive, 86_400_000), [
      { exercise: globalExercise, values: { weightKg: 80, reps: 5 } },
    ]);
    await createWorkout(user, 'all-only', addMilliseconds(period1y.fromInclusive, -86_400_000), [
      { exercise: globalExercise, values: { weightKg: 110, reps: 1 } },
    ]);

    await createWorkout(user, 'cancelled', currentWorkoutTwoEndedAt, [
      { exercise: globalExercise, values: { weightKg: 999, reps: 99 } },
    ], addMilliseconds(currentWorkoutTwoEndedAt, 1));
    await createWorkout(user, 'active', null, [
      { exercise: globalExercise, values: { weightKg: 999, reps: 99 } },
    ]);
    await createWorkout(other, 'other-user', currentWorkoutTwoEndedAt, [
      { exercise: globalExercise, values: { weightKg: 999, reps: 99 } },
    ]);

    await createWorkout(user, 'bogota-before-midnight', new Date('2026-01-15T04:59:00.000Z'), []);
    await createWorkout(user, 'bogota-after-midnight', new Date('2026-01-15T05:01:00.000Z'), []);
    await createWorkout(user, 'bogota-cancelled', new Date('2026-01-15T06:00:00.000Z'), [], new Date('2026-01-15T06:01:00.000Z'));

    await prisma.exerciseStat.create({
      data: {
        userId: user.id,
        exerciseId: globalExercise.id,
        estimated1RM: 114,
        bestWeight: 100,
        bestReps: 20,
        lastSetAt: currentWorkoutTwoEndedAt,
        sessionsCount: 2,
        bestWeightAt: currentWorkoutTwoEndedAt,
        bestRepsWeightKg: null,
        bestRepsAt: addMilliseconds(currentWorkoutTwoEndedAt, -86_400_000),
        estimated1RMAt: currentWorkoutTwoEndedAt,
        estimated1RMWeightKg: 90,
        estimated1RMReps: 8,
      },
    });
    await prisma.exerciseStat.create({
      data: {
        userId: user.id,
        exerciseId: backExercise.id,
        estimated1RM: 53.33,
        bestWeight: 40,
        bestReps: 10,
        lastSetAt: period30.previous.fromInclusive,
        sessionsCount: 1,
        bestWeightAt: period30.previous.fromInclusive,
        bestRepsWeightKg: 40,
        bestRepsAt: period30.previous.fromInclusive,
        estimated1RMAt: period30.previous.fromInclusive,
        estimated1RMWeightKg: 40,
        estimated1RMReps: 10,
      },
    });
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

  it('enforces authentication, bounded queries and indistinguishable exercise visibility', async () => {
    expect((await request(app.getHttpServer()).get(`/api/progress/exercise/${globalExercise.id}`)).status).toBe(401);
    expect((await get(`/api/progress/exercise/${globalExercise.id}?period=week`)).status).toBe(400);
    expect((await get(`/api/progress/exercise/${globalExercise.id}?page=0`)).status).toBe(400);
    expect((await get(`/api/progress/exercise/${globalExercise.id}?limit=26`)).status).toBe(400);
    expect((await get(`/api/progress/exercise/${globalExercise.id}?unknown=1`)).status).toBe(400);
    expect((await get(`/api/progress/exercise/${foreignExercise.id}`)).status).toBe(404);
    expect((await get('/api/progress/exercise/missing-exercise')).status).toBe(404);
    expect((await get(`/api/progress/exercise/${ownExercise.id}`)).status).toBe(200);
  });

  it('returns honest zeros for a visible exercise without eligible sessions', async () => {
    const response = await get(`/api/progress/exercise/${emptyExercise.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      exerciseId: emptyExercise.id,
      period: { key: '30d', from: expect.any(String), to: expect.any(String), timezone: 'America/Bogota' },
      summary: {
        sessionsCount: 0,
        workingSetsCount: 0,
        volumeKg: 0,
        bestWeight: null,
        repetitionRecord: null,
        estimated1RM: null,
      },
      points: [],
      history: { items: [], page: 1, limit: 10, total: 0, hasMore: false },
    });
  });

  it('calculates independent records, real comparison and chronological workout points', async () => {
    const response = await get(`/api/progress/exercise/${globalExercise.id}?period=30d&page=1&limit=10`);

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      sessionsCount: 2,
      workingSetsCount: 4,
      volumeKg: 920,
      bestWeight: {
        weightKg: 100,
        achievedAt: expect.any(String),
        workoutId: currentWorkoutTwoId,
      },
      repetitionRecord: {
        reps: 20,
        weightKg: null,
        achievedAt: expect.any(String),
        workoutId: currentWorkoutOneId,
      },
      estimated1RM: {
        valueKg: 114,
        weightKg: 90,
        reps: 8,
        achievedAt: expect.any(String),
        workoutId: currentWorkoutTwoId,
        formula: 'EPLEY',
      },
    });
    expect(response.body.comparison).toMatchObject({
      previous: {
        sessionsCount: 1,
        workingSetsCount: 1,
        volumeKg: 500,
        bestWeightKg: 50,
        estimated1RMKg: 66.67,
      },
      delta: {
        sessionsCount: 1,
        workingSetsCount: 3,
        volumeKg: 420,
        bestWeightKg: 50,
        estimated1RMKg: 47.33,
      },
    });
    expect(response.body.points.map((point: { workoutId: string }) => point.workoutId)).toEqual([
      currentWorkoutOneId,
      currentWorkoutTwoId,
    ]);
  });

  it('paginates workouts before their ordered eligible sets and handles an out-of-range page', async () => {
    const first = await get(`/api/progress/exercise/${globalExercise.id}?period=30d&page=1&limit=1`);
    const second = await get(`/api/progress/exercise/${globalExercise.id}?period=30d&page=2&limit=1`);
    const empty = await get(`/api/progress/exercise/${globalExercise.id}?period=30d&page=3&limit=1`);

    expect(first.status).toBe(200);
    expect(first.body.history).toMatchObject({ page: 1, limit: 1, total: 2, hasMore: true });
    expect(first.body.history.items).toHaveLength(1);
    expect(first.body.history.items[0].workoutId).toBe(currentWorkoutTwoId);
    expect(first.body.history.items[0].sets.map((set: { order: number }) => set.order)).toEqual([0, 1]);
    expect(second.body.history.items[0].workoutId).toBe(currentWorkoutOneId);
    expect(second.body.history.items[0].sets.map((set: { order: number }) => set.order)).toEqual([0, 1]);
    expect(empty.body.history).toEqual({ items: [], page: 3, limit: 1, total: 2, hasMore: false, nextCursor: null });
  });

  it.each([
    ['30d', 2],
    ['90d', 4],
    ['6m', 5],
    ['1y', 6],
    ['all', 7],
  ])('applies the %s period to completed workouts', async (period, sessionsCount) => {
    const response = await get(
      `/api/progress/exercise/${globalExercise.id}?period=${period}&page=1&limit=25`,
    );

    expect(response.status).toBe(200);
    expect(response.body.summary.sessionsCount).toBe(sessionsCount);
    expect(response.body.period.key).toBe(period);
    if (period === 'all') {
      expect(response.body.period.from).toBeNull();
      expect(response.body.comparison).toBeNull();
      expect(response.body.summary.bestWeight.weightKg).toBe(110);
    }
  });

  it('uses cursors across tied timestamps without repeating sessions when a newer one arrives', async () => {
    const actor = await createUser('cursor');
    const endedAt = new Date('2026-08-20T12:00:00.000Z');
    const set = { exercise: globalExercise, values: { reps: 8, weightKg: 40 } };
    const ids = [
      await createWorkout(actor, 'cursor-a', endedAt, [set]),
      await createWorkout(actor, 'cursor-b', endedAt, [set]),
      await createWorkout(actor, 'cursor-c', endedAt, [set]),
    ].sort().reverse();
    const path = `/api/progress/exercises/${globalExercise.id}?period=all&limit=1`;
    const first = await get(path, actor);
    expect(first.status).toBe(200);
    expect(first.body.history.items[0].workoutId).toBe(ids[0]);
    await createWorkout(actor, 'cursor-new', new Date('2026-08-21T12:00:00.000Z'), [set]);
    const second = await get(`${path}&cursor=${encodeURIComponent(first.body.history.nextCursor)}`, actor);
    const third = await get(`${path}&cursor=${encodeURIComponent(second.body.history.nextCursor)}`, actor);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(second.body.history).toMatchObject({ page: null, hasMore: true });
    expect(second.body.history.items[0].workoutId).toBe(ids[1]);
    expect(third.body.history.items[0].workoutId).toBe(ids[2]);
    expect(third.body.history).toMatchObject({ hasMore: false, nextCursor: null });
    expect((await get(`${path}&cursor=invalid`, actor)).status).toBe(400);
  });

  it('aggregates overview in the 30-day window and only exposes records achieved there', async () => {
    const response = await get('/api/progress/overview?period=30d');

    expect(response.status).toBe(200);
    expect(response.body.period).toMatchObject({ key: '30d', timezone: 'America/Bogota' });
    expect(response.body.summary).toEqual({
      sessionsCompleted: 4,
      volumeKg: 1320,
      activeDays: 3,
      weeklyFrequency: 0.93,
    });
    expect(response.body.records).toHaveLength(3);
    expect(response.body.records.map((record: { exerciseId: string }) => record.exerciseId))
      .toEqual([globalExercise.id, globalExercise.id, globalExercise.id]);
    expect(response.body.muscleDistribution).toEqual([
      { muscleGroup: 'CHEST', workingSets: 4, percentage: 80 },
      { muscleGroup: 'BACK', workingSets: 1, percentage: 20 },
    ]);
    expect(response.body.comparison).toEqual({
      previous: {
        sessionsCompleted: 1,
        volumeKg: 500,
        activeDays: 1,
        weeklyFrequency: 0.23,
      },
      delta: {
        sessionsCompleted: 3,
        volumeKg: 820,
        activeDays: 2,
        weeklyFrequency: 0.7,
      },
    });
  });

  it('validates activity ranges and groups all completed sessions by Bogota endedAt date', async () => {
    expect((await get('/api/progress/activity?from=2026-01-15&to=2026-01-14')).status).toBe(400);
    expect((await get('/api/progress/activity?from=2026-01-01&to=2026-03-04')).status).toBe(400);
    expect((await get('/api/progress/activity?from=2026-02-29&to=2026-03-01')).status).toBe(400);
    expect((await get('/api/progress/activity?from=2026-01-14&to=2026-01-15&extra=1')).status).toBe(400);

    const response = await get('/api/progress/activity?from=2026-01-14&to=2026-01-15');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      from: '2026-01-14',
      to: '2026-01-15',
      days: [
        {
          date: '2026-01-14',
          sessions: [expect.objectContaining({ name: `${prefix}-bogota-before-midnight`, volumeKg: 0 })],
        },
        {
          date: '2026-01-15',
          sessions: [expect.objectContaining({ name: `${prefix}-bogota-after-midnight`, volumeKg: 0 })],
        },
      ],
    });
    expect(response.body.days[0].sessions[0].endedAt).toBe('2026-01-15T04:59:00.000Z');
    expect(response.body.days[1].sessions[0].endedAt).toBe('2026-01-15T05:01:00.000Z');
  });

  it('keeps every progress query scoped to the authenticated user', async () => {
    const response = await get(`/api/progress/exercise/${globalExercise.id}`, other);

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ sessionsCount: 1, workingSetsCount: 1 });
    expect(response.body.summary.bestWeight.weightKg).toBe(999);
    const owner = await get(`/api/progress/exercise/${globalExercise.id}`);
    expect(owner.body.summary.bestWeight.weightKg).toBe(100);
  });

  it('exposes activity dates matching the shared civil formatter', async () => {
    expect(formatCivilDate(new Date('2026-01-15T04:59:00.000Z'))).toBe('2026-01-14');
    expect(formatCivilDate(new Date('2026-01-15T05:01:00.000Z'))).toBe('2026-01-15');
  });
});
