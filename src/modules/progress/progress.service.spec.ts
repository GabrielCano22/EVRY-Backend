import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressRepository } from './progress.repository';
import { ProgressService } from './progress.service';
import type {
  ExerciseProgressPoint,
  OverviewMetrics,
  PeriodMetrics,
} from './progress.types';

const zeroPeriod: PeriodMetrics = {
  sessionsCount: 0,
  workingSetsCount: 0,
  volumeKg: 0,
  bestWeightKg: null,
  estimated1RMKg: null,
};

const zeroOverview: OverviewMetrics = {
  sessionsCompleted: 0,
  volumeKg: 0,
  activeDays: 0,
  weeklyFrequency: 0,
};

describe('ProgressService', () => {
  const now = new Date('2026-08-19T17:00:00.000Z');
  let tx: { exercise: { findFirst: jest.Mock } };
  let prisma: { $transaction: jest.Mock };
  let repository: {
    getExerciseProgress: jest.Mock;
    getOverview: jest.Mock;
    getActivity: jest.Mock;
  };
  let service: ProgressService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    tx = { exercise: { findFirst: jest.fn().mockResolvedValue({ id: 'exercise-1' }) } };
    prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    repository = {
      getExerciseProgress: jest.fn().mockResolvedValue({
        current: {
          metrics: zeroPeriod,
          bestWeight: null,
          repetitionRecord: null,
          estimated1RM: null,
        },
        previous: zeroPeriod,
        points: [],
        history: { items: [], total: 0 },
      }),
      getOverview: jest.fn().mockResolvedValue({
        current: zeroOverview,
        previous: zeroOverview,
        records: [],
        muscleDistribution: [],
      }),
      getActivity: jest.fn().mockResolvedValue([]),
    };
    service = new ProgressService(
      prisma as unknown as PrismaService,
      repository as unknown as ProgressRepository,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('checks exercise visibility before reading progress and uses one repeatable snapshot', async () => {
    const callOrder: string[] = [];
    tx.exercise.findFirst.mockImplementation(async () => {
      callOrder.push('visibility');
      return { id: 'exercise-1' };
    });
    repository.getExerciseProgress.mockImplementation(async () => {
      callOrder.push('repository');
      return {
        current: {
          metrics: zeroPeriod,
          bestWeight: null,
          repetitionRecord: null,
          estimated1RM: null,
        },
        previous: zeroPeriod,
        points: [],
        history: { items: [], total: 0 },
      };
    });

    await service.exerciseProgress('user-1', 'exercise-1', { period: '30d', page: 1, limit: 10 });

    expect(callOrder).toEqual(['visibility', 'repository']);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    expect(repository.getExerciseProgress).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: 'user-1',
        exerciseId: 'exercise-1',
        page: 1,
        limit: 10,
        period: expect.objectContaining({ from: '2026-07-21', to: '2026-08-19' }),
      }),
    );
  });

  it.each(['foreign-exercise', 'missing-exercise'])(
    'returns the same not-found outcome for %s without querying progress',
    async (exerciseId) => {
      tx.exercise.findFirst.mockResolvedValue(null);

      await expect(
        service.exerciseProgress('user-1', exerciseId, { period: '30d', page: 1, limit: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.getExerciseProgress).not.toHaveBeenCalled();
    },
  );

  it('returns a visible exercise with no sessions as zeros, null records and empty collections', async () => {
    await expect(
      service.exerciseProgress('user-1', 'exercise-1', { period: '30d', page: 2, limit: 5 }),
    ).resolves.toEqual({
      exerciseId: 'exercise-1',
      period: {
        key: '30d',
        from: '2026-07-21',
        to: '2026-08-19',
        timezone: 'America/Bogota',
      },
      summary: {
        sessionsCount: 0,
        workingSetsCount: 0,
        volumeKg: 0,
        bestWeight: null,
        repetitionRecord: null,
        estimated1RM: null,
      },
      comparison: {
        period: { from: '2026-06-21', to: '2026-07-20' },
        previous: zeroPeriod,
        delta: zeroPeriod,
      },
      points: [],
      history: { items: [], page: 2, limit: 5, total: 0, hasMore: false },
    });
  });

  it('never converts a repository failure into empty progress', async () => {
    const failure = new Error('database unavailable');
    repository.getExerciseProgress.mockRejectedValue(failure);

    await expect(
      service.exerciseProgress('user-1', 'exercise-1', { period: '30d', page: 1, limit: 10 }),
    ).rejects.toBe(failure);
  });

  it('returns all history without an artificial comparison', async () => {
    repository.getExerciseProgress.mockResolvedValue({
      current: {
        metrics: { ...zeroPeriod, sessionsCount: 1 },
        bestWeight: null,
        repetitionRecord: null,
        estimated1RM: null,
      },
      previous: null,
      points: [] as ExerciseProgressPoint[],
      history: { items: [], total: 1 },
    });

    const result = await service.exerciseProgress(
      'user-1',
      'exercise-1',
      { period: 'all', page: 1, limit: 10 },
    );

    expect(result.period.from).toBeNull();
    expect(result.comparison).toBeNull();
  });

  it('assembles the explicit 30-day overview and its real delta in a repeatable snapshot', async () => {
    repository.getOverview.mockResolvedValue({
      current: { sessionsCompleted: 4, volumeKg: 1200, activeDays: 3, weeklyFrequency: 0.93 },
      previous: { sessionsCompleted: 2, volumeKg: 500, activeDays: 2, weeklyFrequency: 0.47 },
      records: [{
        exerciseId: 'exercise-1',
        exerciseName: 'Press',
        kind: 'WEIGHT',
        value: 100,
        achievedAt: '2026-08-19T14:00:00.000Z',
      }],
      muscleDistribution: [],
    });

    const result = await service.overview('user-1', { period: '30d' });

    expect(result).toMatchObject({
      period: { key: '30d', from: '2026-07-21', to: '2026-08-19', timezone: 'America/Bogota' },
      summary: { sessionsCompleted: 4, volumeKg: 1200, activeDays: 3, weeklyFrequency: 0.93 },
      comparison: {
        previous: { sessionsCompleted: 2, volumeKg: 500, activeDays: 2, weeklyFrequency: 0.47 },
        delta: { sessionsCompleted: 2, volumeKg: 700, activeDays: 1, weeklyFrequency: 0.46 },
      },
    });
    expect(prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  });

  it('validates activity ranges as HTTP 400 before opening a snapshot', async () => {
    await expect(
      service.activity('user-1', { from: '2026-01-01', to: '2026-03-04' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(repository.getActivity).not.toHaveBeenCalled();
  });

  it('groups repository activity rows by Bogota civil date without hiding empty volume sessions', async () => {
    repository.getActivity.mockResolvedValue([
      {
        date: '2026-08-18',
        id: 'workout-2',
        name: 'Noche',
        endedAt: new Date('2026-08-19T04:59:00.000Z'),
        volumeKg: 0,
      },
      {
        date: '2026-08-19',
        id: 'workout-1',
        name: 'Mañana',
        endedAt: new Date('2026-08-19T15:00:00.000Z'),
        volumeKg: 500,
      },
    ]);

    await expect(
      service.activity('user-1', { from: '2026-08-18', to: '2026-08-19' }),
    ).resolves.toEqual({
      from: '2026-08-18',
      to: '2026-08-19',
      days: [
        {
          date: '2026-08-18',
          sessions: [{ id: 'workout-2', name: 'Noche', endedAt: '2026-08-19T04:59:00.000Z', volumeKg: 0 }],
        },
        {
          date: '2026-08-19',
          sessions: [{ id: 'workout-1', name: 'Mañana', endedAt: '2026-08-19T15:00:00.000Z', volumeKg: 500 }],
        },
      ],
    });
  });
});
