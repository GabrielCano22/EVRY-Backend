import { MuscleGroup } from '@prisma/client';
import {
  calculateExerciseMetricSnapshot,
  deltaOverviewMetrics,
  deltaPeriodMetrics,
} from './metrics';
import type { ExerciseMetricSet } from './progress.types';

const endedAt = new Date('2026-08-19T15:00:00.000Z');

function metricSet(overrides: Partial<ExerciseMetricSet> = {}): ExerciseMetricSet {
  return {
    setId: 'set-base',
    workoutId: 'workout-base',
    workoutName: 'Sesión base',
    userId: 'user-1',
    exerciseId: 'exercise-1',
    muscleGroup: MuscleGroup.CHEST,
    endedAt,
    cancelledAt: null,
    completedAt: new Date('2026-08-19T14:00:00.000Z'),
    isWarmup: false,
    weightKg: 80,
    reps: 5,
    durationS: null,
    ...overrides,
  };
}

describe('exercise progress metrics', () => {
  it('selects independent load, repetition and raw-Epley records', () => {
    const result = calculateExerciseMetricSnapshot(
      [
        metricSet({
          setId: 'load',
          workoutId: 'workout-load',
          weightKg: 100,
          reps: 1,
          completedAt: new Date('2026-08-17T14:00:00.000Z'),
        }),
        metricSet({
          setId: 'reps',
          workoutId: 'workout-reps',
          weightKg: null,
          reps: 20,
          completedAt: new Date('2026-08-18T14:00:00.000Z'),
        }),
        metricSet({
          setId: 'epley',
          workoutId: 'workout-epley',
          weightKg: 90,
          reps: 8,
          completedAt: new Date('2026-08-19T14:00:00.000Z'),
        }),
      ],
      'user-1',
    );

    expect(result.metrics).toEqual({
      sessionsCount: 3,
      workingSetsCount: 3,
      volumeKg: 820,
      bestWeightKg: 100,
      estimated1RMKg: 114,
    });
    expect(result.bestWeight).toMatchObject({ weightKg: 100, workoutId: 'workout-load' });
    expect(result.repetitionRecord).toMatchObject({ reps: 20, weightKg: null, workoutId: 'workout-reps' });
    expect(result.estimated1RM).toMatchObject({
      valueKg: 114,
      weightKg: 90,
      reps: 8,
      workoutId: 'workout-epley',
      formula: 'EPLEY',
    });
  });

  it('uses completedAt and then setId descending to break equal records', () => {
    const recent = metricSet({
      setId: 'set-a',
      workoutId: 'recent',
      weightKg: 100,
      reps: 10,
      completedAt: new Date('2026-08-19T14:00:00.000Z'),
    });
    const sameInstantLargerId = metricSet({
      setId: 'set-z',
      workoutId: 'larger-id',
      weightKg: 100,
      reps: 10,
      completedAt: new Date('2026-08-19T14:00:00.000Z'),
    });
    const older = metricSet({
      setId: 'set-older',
      workoutId: 'older',
      weightKg: 100,
      reps: 10,
      completedAt: new Date('2026-08-18T14:00:00.000Z'),
    });

    const result = calculateExerciseMetricSnapshot([recent, sameInstantLargerId, older], 'user-1');

    expect(result.bestWeight?.workoutId).toBe('larger-id');
    expect(result.repetitionRecord?.workoutId).toBe('larger-id');
    expect(result.estimated1RM?.workoutId).toBe('larger-id');
  });

  it('counts useful bodyweight and duration sets without inventing volume or Epley', () => {
    const result = calculateExerciseMetricSnapshot(
      [
        metricSet({ setId: 'bodyweight', weightKg: null, reps: 12 }),
        metricSet({
          setId: 'duration',
          workoutId: 'duration-workout',
          weightKg: null,
          reps: null,
          durationS: 45,
        }),
      ],
      'user-1',
    );

    expect(result.metrics).toEqual({
      sessionsCount: 2,
      workingSetsCount: 2,
      volumeKg: 0,
      bestWeightKg: null,
      estimated1RMKg: null,
    });
    expect(result.repetitionRecord).toMatchObject({ reps: 12, weightKg: null });
    expect(result.bestWeight).toBeNull();
    expect(result.estimated1RM).toBeNull();
  });

  it('excludes warmups, cancelled and active sessions, empty sets and another user', () => {
    const eligible = metricSet({ setId: 'eligible', weightKg: 50, reps: 6 });
    const result = calculateExerciseMetricSnapshot(
      [
        eligible,
        metricSet({ setId: 'warmup', isWarmup: true }),
        metricSet({ setId: 'cancelled', cancelledAt: new Date('2026-08-19T15:01:00.000Z') }),
        metricSet({ setId: 'active', endedAt: null }),
        metricSet({ setId: 'empty', weightKg: 100, reps: 0, durationS: 0 }),
        metricSet({ setId: 'other', userId: 'user-2' }),
      ],
      'user-1',
    );

    expect(result.metrics).toMatchObject({ sessionsCount: 1, workingSetsCount: 1, volumeKg: 300 });
    expect(result.bestWeight?.workoutId).toBe('workout-base');
  });

  it('compares Epley without rounding and rounds only the serialized winner', () => {
    const exactWinner = metricSet({ setId: 'winner', workoutId: 'winner', weightKg: 80, reps: 7 });
    const roundedTie = metricSet({
      setId: 'loser',
      workoutId: 'loser',
      weightKg: 74,
      reps: 10,
      completedAt: new Date('2026-08-20T14:00:00.000Z'),
    });

    const result = calculateExerciseMetricSnapshot([exactWinner, roundedTie], 'user-1');

    expect(result.estimated1RM).toMatchObject({ workoutId: 'winner', valueKg: 98.67 });
  });

  it('produces honest metric deltas, preserving null when neither period has a record', () => {
    expect(
      deltaPeriodMetrics(
        { sessionsCount: 2, workingSetsCount: 5, volumeKg: 500, bestWeightKg: null, estimated1RMKg: 90 },
        { sessionsCount: 1, workingSetsCount: 3, volumeKg: 200, bestWeightKg: null, estimated1RMKg: 100 },
      ),
    ).toEqual({
      sessionsCount: 1,
      workingSetsCount: 2,
      volumeKg: 300,
      bestWeightKg: null,
      estimated1RMKg: -10,
    });
    expect(
      deltaOverviewMetrics(
        { sessionsCompleted: 4, volumeKg: 1200, activeDays: 3, weeklyFrequency: 0.93 },
        { sessionsCompleted: 2, volumeKg: 500, activeDays: 2, weeklyFrequency: 0.47 },
      ),
    ).toEqual({ sessionsCompleted: 2, volumeKg: 700, activeDays: 1, weeklyFrequency: 0.46 });
  });
});
