import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CycleService } from '../cycle/cycle.service';
import { ServicioSesionActiva } from './servicio-sesion-activa';

function uniqueError(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    clientVersion: '5.10.0',
    code: 'P2002',
    meta: { target },
  });
}

function makeService(options?: {
  active?: unknown;
  created?: unknown;
  createError?: unknown;
  routine?: unknown;
  activeAfterConflict?: unknown;
}) {
  const findFirst = jest.fn()
    .mockResolvedValueOnce(options?.active ?? null);
  if (Object.prototype.hasOwnProperty.call(options ?? {}, 'activeAfterConflict')) {
    findFirst.mockResolvedValueOnce(options?.activeAfterConflict);
  }
  const prisma = {
    workout: {
      findFirst,
      create: options?.createError
        ? jest.fn().mockRejectedValue(options.createError)
        : jest.fn().mockResolvedValue(options?.created),
    },
    routine: {
      findFirst: jest.fn().mockResolvedValue(options?.routine ?? null),
    },
  };
  const cycle = { currentPhase: jest.fn().mockResolvedValue('FOLLICULAR') };
  return {
    prisma,
    cycle,
    service: new ServicioSesionActiva(
      prisma as unknown as PrismaService,
      cycle as unknown as CycleService,
    ),
  };
}

describe('ServicioSesionActiva', () => {
  it('returns the existing active workout before validating a new attempt payload', async () => {
    const active = { id: 'workout-active', userId: 'user-1', endedAt: null, cancelledAt: null };
    const { service, prisma, cycle } = makeService({ active });

    await expect(service.iniciarOContinuar('user-1', {
      name: 'Ignored retry name',
      routineId: 'foreign-routine',
    })).resolves.toBe(active);

    expect(prisma.routine.findFirst).not.toHaveBeenCalled();
    expect(cycle.currentPhase).not.toHaveBeenCalled();
    expect(prisma.workout.create).not.toHaveBeenCalled();
    expect(prisma.workout.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', status: 'ACTIVE' },
    }));
  });

  it('validates routine ownership and creates a workout with the current phase', async () => {
    const created = { id: 'workout-new', userId: 'user-1', endedAt: null, cancelledAt: null };
    const { service, prisma } = makeService({ routine: { id: 'routine-1' }, created });

    await expect(service.iniciarOContinuar('user-1', {
      name: 'Leg day',
      notes: 'Controlled',
      routineId: 'routine-1',
    })).resolves.toBe(created);

    expect(prisma.routine.findFirst).toHaveBeenCalledWith({
      where: { id: 'routine-1', userId: 'user-1' },
      select: { id: true },
    });
    expect(prisma.workout.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        userId: 'user-1',
        name: 'Leg day',
        notes: 'Controlled',
        routineId: 'routine-1',
        cyclePhase: 'FOLLICULAR',
      },
    }));
  });

  it('turns both a foreign and a missing routine into not found', async () => {
    const { service, prisma } = makeService();

    await expect(service.iniciarOContinuar('user-1', {
      name: 'Leg day',
      routineId: 'foreign-or-missing',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workout.create).not.toHaveBeenCalled();
  });

  it('recovers the canonical active workout after the expected create race', async () => {
    const winner = { id: 'race-winner', userId: 'user-1', endedAt: null, cancelledAt: null };
    const { service, prisma } = makeService({
      createError: uniqueError(['userId']),
      activeAfterConflict: winner,
    });

    await expect(service.iniciarOContinuar('user-1', { name: 'Concurrent start' }))
      .resolves.toBe(winner);
    expect(prisma.workout.findFirst).toHaveBeenCalledTimes(2);
  });

  it('recognizes the status-based partial unique index as an active-workout race', async () => {
    const winner = { id: 'race-winner', userId: 'user-1', status: 'ACTIVE' };
    const { service } = makeService({
      createError: uniqueError(['Workout_userId_status_active_unique']),
      activeAfterConflict: winner,
    });

    await expect(service.iniciarOContinuar('user-1', { name: 'Concurrent start' }))
      .resolves.toBe(winner);
  });

  it('rethrows an expected unique error when no canonical active workout exists', async () => {
    const error = uniqueError(['userId']);
    const { service } = makeService({ createError: error, activeAfterConflict: null });

    await expect(service.iniciarOContinuar('user-1', { name: 'Concurrent start' }))
      .rejects.toBe(error);
  });

  it('does not recover an unrelated P2002 conflict', async () => {
    const error = uniqueError(['id']);
    const { service, prisma } = makeService({ createError: error, activeAfterConflict: { id: 'wrong' } });

    await expect(service.iniciarOContinuar('user-1', { name: 'Collision' })).rejects.toBe(error);
    expect(prisma.workout.findFirst).toHaveBeenCalledTimes(1);
  });
});
