import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExerciseStatsService } from './exercise-stats.service';
import { ServicioSesionActiva } from './servicio-sesion-activa';
import { WorkoutsService } from './workouts.service';

const mutationId = 'e9c3cf4e-d2c5-4cd5-96e3-eb9b1e005dde';

function uniqueError(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    clientVersion: '5.10.0',
    code: 'P2002',
    meta: { target },
  });
}

function workout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workout-1',
    userId: 'user-1',
    name: 'Workout',
    notes: null,
    startedAt: new Date('2026-08-20T10:00:00.000Z'),
    endedAt: null,
    cancelledAt: null,
    sets: [],
    ...overrides,
  };
}

function makeHarness(options: {
  workout?: ReturnType<typeof workout> | null;
  workoutSet?: Record<string, unknown> | null;
  canonicalSet?: Record<string, unknown> | null;
  transactionError?: unknown;
} = {}) {
  const currentWorkout = Object.prototype.hasOwnProperty.call(options, 'workout')
    ? options.workout
    : workout();
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    workout: {
      findUnique: jest.fn().mockResolvedValue(currentWorkout),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...currentWorkout, ...data })),
      delete: jest.fn().mockResolvedValue(currentWorkout),
    },
    workoutSet: {
      findUnique: jest.fn().mockResolvedValue(options.workoutSet ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'set-created', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'set-1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'set-1' }),
    },
    exercise: {
      findFirst: jest.fn().mockResolvedValue({ id: 'exercise-1', ownerId: null, isCustom: false }),
    },
  };
  const transaction = options.transactionError
    ? jest.fn().mockRejectedValue(options.transactionError)
    : jest.fn().mockImplementation((operation: (client: unknown) => unknown) => operation(tx));
  const prisma = {
    $transaction: transaction,
    workout: {
      findUnique: jest.fn().mockResolvedValue(currentWorkout),
      findMany: jest.fn(),
    },
    workoutSet: {
      findUnique: jest.fn().mockResolvedValue(options.canonicalSet ?? null),
    },
  };
  const activeSession = { iniciarOContinuar: jest.fn() };
  const stats = { rebuildExerciseStats: jest.fn().mockResolvedValue(undefined) };
  return {
    tx,
    prisma,
    activeSession,
    stats,
    service: new WorkoutsService(
      prisma as unknown as PrismaService,
      activeSession as unknown as ServicioSesionActiva,
      stats as unknown as ExerciseStatsService,
    ),
  };
}

describe('WorkoutsService', () => {
  it('delegates create to the idempotent active-session service', async () => {
    const { service, activeSession } = makeHarness();
    const expected = workout();
    activeSession.iniciarOContinuar.mockResolvedValue(expected);

    await expect(service.create('user-1', { name: 'Workout', routineId: 'routine-1' }))
      .resolves.toBe(expected);
    expect(activeSession.iniciarOContinuar).toHaveBeenCalledWith('user-1', {
      name: 'Workout',
      routineId: 'routine-1',
    });
  });

  it('includes planned routine exercises when loading a workout', async () => {
    const plannedExercise = {
      id: 'routine-exercise-1',
      exerciseId: 'exercise-1',
      order: 0,
      targetSets: 3,
      targetReps: 10,
      targetWeightKg: 50,
      notes: null,
      exercise: { id: 'exercise-1', name: 'Squat' },
    };
    const { service, prisma } = makeHarness({
      workout: workout({ routine: { id: 'routine-1', name: 'Legs', exercises: [plannedExercise] } }),
    });

    const result = await service.get('user-1', 'workout-1');

    expect((result as any).routine?.exercises).toEqual([plannedExercise]);
    expect(prisma.workout.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ routine: expect.any(Object) }),
    }));
  });

  it('returns the canonical set for a repeated mutation id without creating another row', async () => {
    const canonical = { id: 'set-canonical', workoutId: 'workout-1', clientMutationId: mutationId };
    const { service, tx } = makeHarness({ workoutSet: canonical });

    await expect(service.addSet('user-1', 'workout-1', {
      clientMutationId: mutationId,
      exerciseId: 'exercise-1',
      order: 0,
      reps: 10,
    })).resolves.toBe(canonical);

    expect(tx.exercise.findFirst).toHaveBeenCalled();
    expect(tx.workoutSet.create).not.toHaveBeenCalled();
  });

  it('creates a visible exercise set inside the workout transaction', async () => {
    const { service, tx } = makeHarness();

    await expect(service.addSet('user-1', 'workout-1', {
      clientMutationId: mutationId,
      exerciseId: 'exercise-1',
      order: 1,
      weightKg: 60,
      reps: 8,
      techniqueStable: true,
    })).resolves.toMatchObject({ id: 'set-created', workoutId: 'workout-1' });

    expect(tx.workoutSet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workoutId: 'workout-1',
        clientMutationId: mutationId,
        exerciseId: 'exercise-1',
      }),
    }));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('uses the approved visibility helper and hides foreign or missing exercises', async () => {
    const { service, tx } = makeHarness();
    tx.exercise.findFirst.mockResolvedValue(null);

    await expect(service.addSet('user-1', 'workout-1', {
      clientMutationId: mutationId,
      exerciseId: 'foreign-or-missing',
      order: 0,
      reps: 10,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.workoutSet.create).not.toHaveBeenCalled();
  });

  it('recovers only the expected set mutation P2002 by rereading the definitive row', async () => {
    const canonical = { id: 'set-race-winner', workoutId: 'workout-1', clientMutationId: mutationId };
    const { service, prisma } = makeHarness({
      transactionError: uniqueError(['workoutId', 'clientMutationId']),
      canonicalSet: canonical,
    });

    await expect(service.addSet('user-1', 'workout-1', {
      clientMutationId: mutationId,
      exerciseId: 'exercise-1',
      order: 0,
      reps: 10,
    })).resolves.toBe(canonical);
    expect(prisma.workoutSet.findUnique).toHaveBeenCalledTimes(1);
  });

  it('rethrows unrelated P2002 conflicts instead of treating them as idempotency', async () => {
    const error = uniqueError(['id']);
    const { service, prisma } = makeHarness({ transactionError: error, canonicalSet: { id: 'wrong' } });

    await expect(service.addSet('user-1', 'workout-1', {
      clientMutationId: mutationId,
      exerciseId: 'exercise-1',
      order: 0,
      reps: 10,
    })).rejects.toBe(error);
    expect(prisma.workoutSet.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['finished', { endedAt: new Date('2026-08-20T11:00:00.000Z') }],
    ['cancelled', { cancelledAt: new Date('2026-08-20T11:00:00.000Z') }],
  ])('rejects add, update, delete, and workout patch after a session is %s', async (_state, terminal) => {
    const terminalWorkout = workout(terminal);
    const terminalSet = { id: 'set-1', workout: terminalWorkout };
    const { service, tx } = makeHarness({ workout: terminalWorkout, workoutSet: terminalSet });

    await expect(service.addSet('user-1', 'workout-1', {
      clientMutationId: mutationId,
      exerciseId: 'exercise-1',
      order: 0,
      reps: 10,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateSet('user-1', 'set-1', { reps: 11 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.removeSet('user-1', 'set-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('user-1', 'workout-1', { notes: 'No mutation' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.workoutSet.update).not.toHaveBeenCalled();
    expect(tx.workoutSet.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', []],
    ['weight only', [{ id: 'set-weight', exerciseId: 'exercise-1', weightKg: 100, reps: null, durationS: null }]],
    ['zeroes', [{ id: 'set-zero', exerciseId: 'exercise-1', weightKg: 100, reps: 0, durationS: 0 }]],
  ])('does not finish a workout containing %s', async (_case, sets) => {
    const { service, tx, stats } = makeHarness({ workout: workout({ sets }) });

    await expect(service.finish('user-1', 'workout-1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.workout.update).not.toHaveBeenCalled();
    expect(stats.rebuildExerciseStats).not.toHaveBeenCalled();
  });

  it('finishes a useful workout and rebuilds affected stats in the same transaction', async () => {
    const usefulSet = { id: 'set-useful', exerciseId: 'exercise-1', weightKg: null, reps: null, durationS: 60 };
    const { service, tx, stats } = makeHarness({ workout: workout({ sets: [usefulSet] }) });

    await expect(service.finish('user-1', 'workout-1', { notes: 'Finished' }))
      .resolves.toMatchObject({ id: 'workout-1', endedAt: expect.any(Date), notes: 'Finished' });
    expect(stats.rebuildExerciseStats).toHaveBeenCalledWith(tx, 'user-1', ['exercise-1']);
    expect(tx.workout.update.mock.invocationCallOrder[0])
      .toBeLessThan(stats.rebuildExerciseStats.mock.invocationCallOrder[0]);
  });

  it('allows a useful warmup-only workout to finish while stats keeps filtering warmups', async () => {
    const warmupSet = {
      id: 'set-warmup',
      exerciseId: 'exercise-1',
      weightKg: 20,
      reps: 12,
      durationS: null,
      isWarmup: true,
    };
    const { service, stats } = makeHarness({ workout: workout({ sets: [warmupSet] }) });

    await expect(service.finish('user-1', 'workout-1', {}))
      .resolves.toMatchObject({ endedAt: expect.any(Date) });
    expect(stats.rebuildExerciseStats).toHaveBeenCalledWith(expect.any(Object), 'user-1', ['exercise-1']);
  });

  it('returns an already-finished workout without recalculating stats', async () => {
    const finished = workout({ endedAt: new Date('2026-08-20T11:00:00.000Z') });
    const { service, tx, stats } = makeHarness({ workout: finished });

    await expect(service.finish('user-1', 'workout-1', {})).resolves.toBe(finished);
    expect(tx.workout.update).not.toHaveBeenCalled();
    expect(stats.rebuildExerciseStats).not.toHaveBeenCalled();
  });

  it('propagates a stats failure from finish so the transaction can roll back', async () => {
    const usefulSet = { id: 'set-useful', exerciseId: 'exercise-1', reps: 8, durationS: null };
    const { service, stats } = makeHarness({ workout: workout({ sets: [usefulSet] }) });
    const failure = new Error('stats failed');
    stats.rebuildExerciseStats.mockRejectedValue(failure);

    await expect(service.finish('user-1', 'workout-1', {})).rejects.toBe(failure);
  });

  it('cancels an active workout and returns the same cancelled workout on retry', async () => {
    const cancelledAt = new Date('2026-08-20T11:00:00.000Z');
    const { service, tx } = makeHarness();
    tx.workout.update.mockResolvedValue(workout({ cancelledAt }));

    await expect(service.cancel('user-1', 'workout-1')).resolves.toMatchObject({ cancelledAt });
    expect(tx.workout.update).toHaveBeenCalledTimes(1);

    tx.workout.findUnique.mockResolvedValue(workout({ cancelledAt }));
    await expect(service.cancel('user-1', 'workout-1')).resolves.toMatchObject({ cancelledAt });
    expect(tx.workout.update).toHaveBeenCalledTimes(1);
  });

  it('rejects finishing a cancelled workout', async () => {
    const { service } = makeHarness({
      workout: workout({ cancelledAt: new Date('2026-08-20T11:00:00.000Z') }),
    });

    await expect(service.finish('user-1', 'workout-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects deleting an active workout', async () => {
    const { service, tx } = makeHarness();

    await expect(service.remove('user-1', 'workout-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.workout.delete).not.toHaveBeenCalled();
  });

  it.each(['finished', 'cancelled'])('deletes a %s historical workout and rebuilds its exercises', async (state) => {
    const historical = workout({
      endedAt: state === 'finished' ? new Date('2026-08-20T11:00:00.000Z') : null,
      cancelledAt: state === 'cancelled' ? new Date('2026-08-20T11:00:00.000Z') : null,
      sets: [{ exerciseId: 'exercise-1' }, { exerciseId: 'exercise-1' }, { exerciseId: 'exercise-2' }],
    });
    const { service, tx, stats } = makeHarness({ workout: historical });

    await expect(service.remove('user-1', 'workout-1')).resolves.toEqual({ ok: true });
    expect(tx.workout.delete).toHaveBeenCalledWith({ where: { id: 'workout-1' } });
    expect(stats.rebuildExerciseStats).toHaveBeenCalledWith(tx, 'user-1', ['exercise-1', 'exercise-2']);
  });
});
