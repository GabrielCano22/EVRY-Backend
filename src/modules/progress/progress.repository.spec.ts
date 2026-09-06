import { Prisma } from '@prisma/client';
import { ProgressRepository } from './progress.repository';
import { resolveProgressPeriod } from './progress-period';
import { decodeHistoryCursor } from './history-cursor';

it('uses the full comparison window for weekly frequency, including inactive days', async () => {
  const queryRaw = jest.fn()
    .mockResolvedValueOnce([{ sessionsCompleted: 4n, volumeKg: 100, activeDays: 1n, firstCompletedAt: new Date('2026-08-30T12:00:00.000Z') }])
    .mockResolvedValueOnce([{ sessionsCompleted: 2n, volumeKg: 50, activeDays: 1n, firstCompletedAt: new Date('2026-07-31T12:00:00.000Z') }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ streakDays: 3n }])
    .mockResolvedValueOnce([{
      id: 'workout-1', name: 'Sesión reciente', startedAt: new Date('2026-08-30T11:00:00.000Z'),
      endedAt: new Date('2026-08-30T12:00:00.000Z'), setCount: 4n, volumeKg: 850,
    }]);
  const result = await new ProgressRepository().getOverview(
    { $queryRaw: queryRaw } as never, 'user-1', resolveProgressPeriod('30d', new Date('2026-08-30T12:00:00.000Z')),
  );
  expect(result.current.weeklyFrequency).toBe(0.93);
  expect(result.previous?.weeklyFrequency).toBe(0.47);
  expect(result).toMatchObject({
    streakDays: 3,
    recentWorkouts: [{
      id: 'workout-1', name: 'Sesión reciente', setCount: 4, volumeKg: 850,
      startedAt: '2026-08-30T11:00:00.000Z', endedAt: '2026-08-30T12:00:00.000Z',
    }],
  });
  const streakQuery = queryRaw.mock.calls[4][0] as Prisma.Sql;
  expect(streakQuery.sql).toContain('WITH RECURSIVE');
  const recentQuery = queryRaw.mock.calls[5][0] as Prisma.Sql;
  expect(recentQuery.sql).toContain('LIMIT ?');
  expect(recentQuery.values).toContain(5);
});

it('uses a bounded keyset query and builds the next cursor from the last returned session', async () => {
  const endedAt = new Date('2026-08-29T12:00:00.000Z');
  const queryRaw = jest.fn()
    .mockResolvedValueOnce([]) // aggregate
    .mockResolvedValueOnce([]) // records
    .mockResolvedValueOnce([]) // chart
    .mockResolvedValueOnce([{ total: 10n }])
    .mockResolvedValueOnce(['workout-c', 'workout-b', 'workout-a'].map((workoutId) => ({
      workoutId, workoutName: workoutId, startedAt: endedAt, endedAt,
    })))
    .mockResolvedValueOnce([]); // selected sets
  const result = await new ProgressRepository().getExerciseProgress({ $queryRaw: queryRaw } as never, {
    userId: 'user-1', exerciseId: 'exercise-1',
    period: resolveProgressPeriod('all', new Date('2026-08-30T12:00:00.000Z')),
    page: 1, limit: 2, cursor: { endedAt, workoutId: 'workout-d' },
  });

  expect(result.history.items.map((item) => item.workoutId)).toEqual(['workout-c', 'workout-b']);
  expect(result.history.hasMore).toBe(true);
  expect(decodeHistoryCursor(result.history.nextCursor!, { exerciseId: 'exercise-1', period: 'all' }))
    .toEqual({ endedAt, workoutId: 'workout-b' });
  const historyQuery = queryRaw.mock.calls[4][0] as Prisma.Sql;
  expect(historyQuery.sql).toMatch(/\(w\."endedAt", w\."id"\) < \(\?, \?\)/);
  expect(historyQuery.sql).not.toContain('OFFSET');
  expect(historyQuery.values).toEqual(expect.arrayContaining(['user-1', 'exercise-1', endedAt, 'workout-d', 3]));
  const setQuery = queryRaw.mock.calls[5][0] as Prisma.Sql;
  expect(setQuery.values).not.toContain('workout-a');
});
