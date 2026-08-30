import { decodeHistoryCursor, encodeHistoryCursor } from './history-cursor';

const scope = { exerciseId: 'exercise-1', period: '30d' as const };

it('preserves both sort keys so sessions completed at the same instant can be paged', () => {
  const token = encodeHistoryCursor({ ...scope, endedAt: new Date('2026-08-30T12:00:00.000Z'), workoutId: 'workout-b' });
  expect(decodeHistoryCursor(token, scope)).toEqual({ endedAt: new Date('2026-08-30T12:00:00.000Z'), workoutId: 'workout-b' });
});

it.each(['not-json', '', 'x'.repeat(513), Buffer.from('{"v":1,"endedAt":"invalid"}').toString('base64url')])(
  'rejects a malformed history cursor %#', (token) => {
    expect(() => decodeHistoryCursor(token, scope)).toThrow();
  },
);

it('rejects a cursor from another exercise or period', () => {
  const token = encodeHistoryCursor({ ...scope, endedAt: new Date('2026-08-30T12:00:00.000Z'), workoutId: 'workout-b' });
  expect(() => decodeHistoryCursor(token, { ...scope, exerciseId: 'exercise-2' })).toThrow();
  expect(() => decodeHistoryCursor(token, { ...scope, period: 'all' })).toThrow();
});
