import { AdaptiveService } from './adaptive.service';

function set(overrides: Record<string, unknown> = {}) {
  return {
    workoutId: 'workout-1',
    exerciseId: 'exercise-1',
    weightKg: 50,
    reps: 8,
    rpe: 7,
    completedAt: new Date('2026-08-28T15:00:00.000Z'),
    workout: { id: 'workout-1' },
    ...overrides,
  };
}

describe('AdaptiveService', () => {
  it('no inventa una carga con menos de dos sesiones comparables', async () => {
    const prisma = { workoutSet: { findMany: jest.fn().mockResolvedValue([set()]) } };
    const cycle = { phaseInfo: jest.fn().mockResolvedValue({ phase: 'FOLLICULAR', trainingHint: 'Contexto estimado.' }) };
    const readiness = { latest: jest.fn().mockResolvedValue({ score: 90 }) };
    const service = new AdaptiveService(prisma as never, cycle as never, readiness as never);

    await expect(service.recommend('user-1', 'exercise-1')).resolves.toMatchObject({
      action: 'HOLD',
      targetWeightKg: null,
      targetReps: null,
    });
  });

  it('progresa tras dos sesiones comparables y readiness actual no bajo, sin multiplicar por ciclo', async () => {
    const prisma = {
      workoutSet: {
        findMany: jest.fn().mockResolvedValue([
          set(),
          set({ workoutId: 'workout-2', workout: { id: 'workout-2' }, completedAt: new Date('2026-08-25T15:00:00.000Z') }),
        ]),
      },
    };
    const cycle = {
      phaseInfo: jest.fn().mockResolvedValue({
        phase: 'MENSTRUAL',
        trainingHint: 'El contexto puede variar.',
        intensityCap: 0.1,
      }),
    };
    const readiness = { latest: jest.fn().mockResolvedValue({ score: 80 }) };
    const service = new AdaptiveService(prisma as never, cycle as never, readiness as never);

    await expect(service.recommend('user-1', 'exercise-1')).resolves.toMatchObject({
      action: 'PROGRESS',
      targetWeightKg: 51,
      targetReps: 8,
    });
  });

  it('mantiene la carga cuando readiness del mismo día es bajo', async () => {
    const prisma = {
      workoutSet: {
        findMany: jest.fn().mockResolvedValue([
          set(),
          set({ workoutId: 'workout-2', workout: { id: 'workout-2' } }),
        ]),
      },
    };
    const service = new AdaptiveService(
      prisma as never,
      { phaseInfo: jest.fn().mockResolvedValue(null) } as never,
      { latest: jest.fn().mockResolvedValue({ score: 40 }) } as never,
    );

    await expect(service.recommend('user-1', 'exercise-1')).resolves.toMatchObject({
      action: 'HOLD',
      targetWeightKg: 50,
    });
  });
});
