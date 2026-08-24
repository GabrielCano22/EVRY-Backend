import { Prisma } from '@prisma/client';
import { ExerciseStatsService } from './exercise-stats.service';

type EligibleSet = {
  id: string;
  workoutId: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  completedAt: Date;
};

function set(values: Partial<EligibleSet> & Pick<EligibleSet, 'id' | 'workoutId' | 'exerciseId'>): EligibleSet {
  return {
    weightKg: null,
    reps: null,
    durationS: null,
    completedAt: new Date('2026-08-20T12:00:00.000Z'),
    ...values,
  };
}

function transactionWith(sets: EligibleSet[]) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    workoutSet: { findMany: jest.fn().mockResolvedValue(sets) },
    exerciseStat: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('ExerciseStatsService', () => {
  it('rebuilds independent weight, repetition, and Epley records from eligible sets', async () => {
    const first = new Date('2026-08-18T12:00:00.000Z');
    const second = new Date('2026-08-19T12:00:00.000Z');
    const third = new Date('2026-08-20T12:00:00.000Z');
    const tx = transactionWith([
      set({ id: 'weight', workoutId: 'workout-1', exerciseId: 'exercise-1', weightKg: 100, reps: 1, completedAt: first }),
      set({ id: 'reps', workoutId: 'workout-2', exerciseId: 'exercise-1', weightKg: 50, reps: 20, completedAt: second }),
      set({ id: 'epley', workoutId: 'workout-3', exerciseId: 'exercise-1', weightKg: 90, reps: 8, completedAt: third }),
      set({ id: 'bodyweight', workoutId: 'workout-4', exerciseId: 'exercise-bodyweight', reps: 12, completedAt: second }),
      set({ id: 'duration', workoutId: 'workout-5', exerciseId: 'exercise-duration', durationS: 90, completedAt: third }),
    ]);
    const service = new ExerciseStatsService();

    await service.rebuildExerciseStats(tx as unknown as Prisma.TransactionClient, 'user-1', [
      'exercise-1',
      'exercise-bodyweight',
      'exercise-duration',
      'exercise-1',
    ]);

    expect(tx.exerciseStat.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        {
          userId: 'user-1',
          exerciseId: 'exercise-1',
          estimated1RM: 114,
          bestWeight: 100,
          bestReps: 20,
          lastSetAt: third,
          trendSlope: 0,
          sessionsCount: 3,
          bestWeightAt: first,
          bestRepsWeightKg: 50,
          bestRepsAt: second,
          estimated1RMAt: third,
          estimated1RMWeightKg: 90,
          estimated1RMReps: 8,
        },
        {
          userId: 'user-1',
          exerciseId: 'exercise-bodyweight',
          estimated1RM: 0,
          bestWeight: 0,
          bestReps: 12,
          lastSetAt: second,
          trendSlope: 0,
          sessionsCount: 1,
          bestWeightAt: null,
          bestRepsWeightKg: null,
          bestRepsAt: second,
          estimated1RMAt: null,
          estimated1RMWeightKg: null,
          estimated1RMReps: null,
        },
        {
          userId: 'user-1',
          exerciseId: 'exercise-duration',
          estimated1RM: 0,
          bestWeight: 0,
          bestReps: 0,
          lastSetAt: third,
          trendSlope: 0,
          sessionsCount: 1,
          bestWeightAt: null,
          bestRepsWeightKg: null,
          bestRepsAt: null,
          estimated1RMAt: null,
          estimated1RMWeightKg: null,
          estimated1RMReps: null,
        },
      ]),
    });
    expect(tx.exerciseStat.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(tx.exerciseStat.createMany.mock.invocationCallOrder[0]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('uses recency and then set id to break equal records without rounding Epley', async () => {
    const oldDate = new Date('2026-08-19T12:00:00.000Z');
    const recentDate = new Date('2026-08-20T12:00:00.000Z');
    const tx = transactionWith([
      set({ id: 'z-old', workoutId: 'workout-1', exerciseId: 'exercise-tie', weightKg: 60, reps: 5, completedAt: oldDate }),
      set({ id: 'a-recent', workoutId: 'workout-2', exerciseId: 'exercise-tie', weightKg: 50, reps: 12, completedAt: recentDate }),
      set({ id: 'z-recent', workoutId: 'workout-3', exerciseId: 'exercise-tie', weightKg: 50, reps: 12, completedAt: recentDate }),
    ]);

    await new ExerciseStatsService().rebuildExerciseStats(
      tx as unknown as Prisma.TransactionClient,
      'user-1',
      ['exercise-tie'],
    );

    expect(tx.exerciseStat.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        estimated1RM: 70,
        estimated1RMAt: recentDate,
        estimated1RMWeightKg: 50,
        estimated1RMReps: 12,
        bestRepsAt: recentDate,
        bestRepsWeightKg: 50,
      })],
    });
  });

  it('deletes stale derived rows when no eligible set remains', async () => {
    const tx = transactionWith([]);

    await new ExerciseStatsService().rebuildExerciseStats(
      tx as unknown as Prisma.TransactionClient,
      'user-1',
      ['exercise-stale', 'exercise-stale'],
    );

    expect(tx.workoutSet.findMany).toHaveBeenCalledWith({
      where: {
        exerciseId: { in: ['exercise-stale'] },
        isWarmup: false,
        OR: [{ reps: { gt: 0 } }, { durationS: { gt: 0 } }],
        workout: { userId: 'user-1', endedAt: { not: null }, cancelledAt: null },
      },
      select: {
        id: true,
        workoutId: true,
        exerciseId: true,
        weightKg: true,
        reps: true,
        durationS: true,
        completedAt: true,
      },
    });
    expect(tx.exerciseStat.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', exerciseId: { in: ['exercise-stale'] } },
    });
    expect(tx.exerciseStat.createMany).not.toHaveBeenCalled();
  });

  it('does not query or mutate stats for an empty affected subset', async () => {
    const tx = transactionWith([]);

    await new ExerciseStatsService().rebuildExerciseStats(
      tx as unknown as Prisma.TransactionClient,
      'user-1',
      [],
    );

    expect(tx.workoutSet.findMany).not.toHaveBeenCalled();
    expect(tx.exerciseStat.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
