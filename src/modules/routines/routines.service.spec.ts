import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { ServicioSesionActiva } from '../workouts/servicio-sesion-activa';

const relationInclude = {
  exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
};

function createTransaction(exerciseIds: string[] = ['global', 'owned']) {
  return {
    exercise: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        const requestedIds = where.AND[1].id.in as string[];
        return Promise.resolve(exerciseIds.filter((id) => requestedIds.includes(id)).map((id) => ({ id })));
      }),
    },
    routine: {
      create: jest.fn().mockResolvedValue({ id: 'routine-1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'routine-1', userId: 'user-1' }),
      update: jest.fn().mockResolvedValue({ id: 'routine-1', exercises: [] }),
    },
    routineExercise: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
}

function createService(transaction = createTransaction()) {
  const prisma = {
    $transaction: jest.fn((work: (tx: typeof transaction) => unknown) => work(transaction)),
    exercise: transaction.exercise,
    routine: transaction.routine,
    routineExercise: transaction.routineExercise,
  };
  return {
    prisma,
    transaction,
    service: new RoutinesService(prisma as never, {} as ServicioSesionActiva),
  };
}

describe('RoutinesService', () => {
  it('creates a routine by validating visible exercises and writing through one transaction', async () => {
    const { prisma, transaction, service } = createService();
    const plan = [
      { reps: 12, weightKg: 20 },
      { reps: 10, weightKg: 22.5 },
      { reps: 8, weightKg: 25 },
    ];

    await expect(
      service.create('user-1', {
        name: 'Rutina progresiva',
        exercises: [
          { exerciseId: 'global', order: 1, targetSets: 3, seriesPlan: plan },
          { exerciseId: 'owned', order: 0, targetSets: 1 },
        ],
      }),
    ).resolves.toEqual({ id: 'routine-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }),
    );
    expect(transaction.routine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        exercises: {
          create: [
            expect.objectContaining({ order: 1, seriesPlan: plan }),
            expect.objectContaining({ order: 0, seriesPlan: undefined }),
          ],
        },
      }),
      include: relationInclude,
    });
  });

  it('rejects repeated exercises before opening a routine transaction', async () => {
    const { prisma, service } = createService();

    await expect(
      service.create('user-1', {
        name: 'Rutina de prueba',
        exercises: [
          { exerciseId: 'global', order: 0, targetSets: 3 },
          { exerciseId: 'global', order: 1, targetSets: 3 },
        ],
      }),
    ).rejects.toThrow('No puedes repetir un ejercicio en la misma rutina.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['a series plan with a different length', { targetSets: 2, seriesPlan: [{ reps: 10 }] }],
    ['a negative target weight', { targetSets: 1, targetWeightKg: -0.5 }],
    ['a negative series-plan weight', { targetSets: 1, seriesPlan: [{ weightKg: -0.5 }] }],
  ])('rejects %s before writing', async (_case, invalidExercise) => {
    const { prisma, service } = createService();

    await expect(
      service.create('user-1', {
        name: 'Rutina inválida',
        exercises: [{ exerciseId: 'global', order: 0, ...invalidExercise }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invisible routine exercise as not found without creating the routine', async () => {
    const { transaction, service } = createService(createTransaction(['global']));

    await expect(
      service.create('user-1', {
        name: 'Rutina privada',
        exercises: [
          { exerciseId: 'global', order: 0, targetSets: 1 },
          { exerciseId: 'foreign-or-missing', order: 1, targetSets: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.routine.create).not.toHaveBeenCalled();
  });

  it('replaces routine exercises atomically using the transaction client and keeps their order', async () => {
    const { prisma, transaction, service } = createService();
    const plan = [{ reps: 10, weightKg: 20 }, { reps: 8, weightKg: 22.5 }];

    await expect(
      service.update('user-1', 'routine-1', {
        name: 'Nueva rutina',
        exercises: [
          { exerciseId: 'owned', order: 1, targetSets: 2, seriesPlan: plan },
          { exerciseId: 'global', order: 0, targetSets: 1 },
        ],
      }),
    ).resolves.toEqual({ id: 'routine-1', exercises: [] });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.routine.findUnique).toHaveBeenCalledWith({ where: { id: 'routine-1' } });
    expect(transaction.exercise.findMany).toHaveBeenCalledTimes(1);
    expect(transaction.routineExercise.deleteMany).toHaveBeenCalledWith({ where: { routineId: 'routine-1' } });
    expect(transaction.routine.update).toHaveBeenCalledWith({
      where: { id: 'routine-1' },
      data: expect.objectContaining({
        exercises: { create: [expect.objectContaining({ order: 1, seriesPlan: plan }), expect.objectContaining({ order: 0 })] },
      }),
      include: relationInclude,
    });
  });

  it('does not mutate a routine owned by another user', async () => {
    const transaction = createTransaction();
    transaction.routine.findUnique.mockResolvedValue({ id: 'routine-1', userId: 'other-user' });
    const { transaction: tx, service } = createService(transaction);

    await expect(service.update('user-1', 'routine-1', { name: 'No tocar' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.routineExercise.deleteMany).not.toHaveBeenCalled();
    expect(tx.routine.update).not.toHaveBeenCalled();
  });

  it('updates routine fields without replacing exercises when exercises are absent', async () => {
    const { transaction, service } = createService();

    await service.update('user-1', 'routine-1', { name: 'Solo cabecera' });

    expect(transaction.routineExercise.deleteMany).not.toHaveBeenCalled();
    expect(transaction.routine.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ exercises: undefined }) }),
    );
  });

  it('keeps all replacement writes inside the transaction when recreation fails', async () => {
    const { prisma, transaction, service } = createService();
    transaction.routine.update.mockRejectedValue(new Error('create failed'));

    await expect(
      service.update('user-1', 'routine-1', {
        exercises: [{ exerciseId: 'global', order: 0, targetSets: 1 }],
      }),
    ).rejects.toThrow('create failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.routineExercise.deleteMany).toHaveBeenCalledTimes(1);
  });
});
