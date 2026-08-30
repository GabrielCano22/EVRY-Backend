import { SyncService } from './sync.service';

const dto = {
  clientId: 'e9c3cf4e-d2c5-4cd5-96e3-eb9b1e005dde',
  syncId: '094ff5b5-f690-43ac-b3e6-b8a2b47cc924',
  baseRevision: 0,
  name: 'Offline workout',
  startedAt: '2026-08-28T15:00:00.000Z',
  status: 'ACTIVE' as const,
  sets: [],
  deletedSetClientIds: [],
};

function serviceWithTransaction(transaction: Record<string, unknown>) {
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: unknown) => unknown) => operation(transaction)),
  };
  return { prisma, service: new SyncService(prisma as never, { rebuildExerciseStats: jest.fn() } as never) };
}

describe('SyncService', () => {
  it.each([
    { sets: [
      { clientId: 'same', baseRevision: 0, exerciseId: 'exercise-1', order: 0 },
      { clientId: 'same', baseRevision: 0, exerciseId: 'exercise-1', order: 1 },
    ], deletedSetClientIds: [] },
    { sets: [
      { clientId: 'first', baseRevision: 0, exerciseId: 'exercise-1', order: 0 },
      { clientId: 'second', baseRevision: 0, exerciseId: 'exercise-1', order: 0 },
    ], deletedSetClientIds: [] },
    { sets: [{ clientId: 'same', baseRevision: 0, exerciseId: 'exercise-1', order: 0 }], deletedSetClientIds: ['same'] },
  ])('rejects ambiguous duplicate or deleted set input before mutating data %#', async (input) => {
    const { prisma, service } = serviceWithTransaction({});
    await expect(service.syncWorkout('user-1', { ...dto, ...input }))
      .rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces a deleted set at the same order without violating the unique slot', async () => {
    const oldSet = { id: 'old-server-set', clientId: 'old-set', exerciseId: 'exercise-1', order: 0, revision: 1 };
    let sets = [oldSet];
    let revision = 1;
    const canonical = () => ({ id: 'server-workout', clientId: dto.clientId, status: 'ACTIVE', revision, sets: [...sets] });
    const tx = {
      $executeRaw: jest.fn(),
      exercise: { findMany: async () => [{ id: 'exercise-1' }] },
      workout: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockImplementation(async () => canonical()),
        findUnique: async () => canonical(),
        update: async () => { revision += 1; },
      },
      workoutSet: {
        deleteMany: async ({ where }: { where: { clientId: { in: string[] } } }) => {
          sets = sets.filter((set) => !where.clientId.in.includes(set.clientId));
        },
        create: async ({ data }: { data: typeof oldSet }) => {
          if (sets.some((set) => set.exerciseId === data.exerciseId && set.order === data.order)) {
            throw new Error('Unique workout/exercise/order violation');
          }
          sets.push({ ...data, id: 'new-server-set' });
        },
        findMany: async () => sets.map(({ exerciseId }) => ({ exerciseId })),
      },
    };
    const { service } = serviceWithTransaction(tx);
    const result = await service.syncWorkout('user-1', {
      ...dto, baseRevision: 1,
      sets: [{ clientId: 'new-set', baseRevision: 0, exerciseId: 'exercise-1', order: 0, reps: 8 }],
      deletedSetClientIds: ['old-set'],
    });
    expect(result.mapping.sets).toEqual([{ clientId: 'new-set', serverId: 'new-server-set', revision: 1 }]);
  });

  it('devuelve la versión canónica sin mutar al repetir el mismo syncId', async () => {
    const canonical = { id: 'server-workout', clientId: dto.clientId, revision: 3, sets: [] };
    const tx = {
      $executeRaw: jest.fn(),
      workout: {
        findFirst: jest.fn().mockResolvedValue(canonical),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      workoutSet: { create: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };
    const { service } = serviceWithTransaction(tx);

    await expect(service.syncWorkout('user-1', dto)).resolves.toMatchObject({
      revision: 3,
      mapping: { workout: { clientId: dto.clientId, serverId: 'server-workout' } },
    });
    expect(tx.workout.create).not.toHaveBeenCalled();
    expect(tx.workout.update).not.toHaveBeenCalled();
  });

  it('devuelve conflicto con la versión del servidor si baseRevision quedó atrás', async () => {
    const canonical = { id: 'server-workout', clientId: dto.clientId, revision: 4, sets: [] };
    const tx = {
      $executeRaw: jest.fn(),
      workout: {
        findFirst: jest.fn().mockResolvedValueOnce(null),
        findUnique: jest.fn().mockResolvedValue(canonical),
      },
    };
    const { service } = serviceWithTransaction(tx);

    await expect(service.syncWorkout('user-1', { ...dto, baseRevision: 2 }))
      .rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'REVISION_CONFLICT',
          serverVersion: canonical,
        }),
      });
  });
});
