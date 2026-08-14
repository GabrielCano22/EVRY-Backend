import { PrismaService } from '../../prisma/prisma.service';
import { WorkoutsService } from './workouts.service';
import { ServicioSesionActiva } from './servicio-sesion-activa';

describe('WorkoutsService', () => {
  it('includes the planned routine exercises when loading a workout', async () => {
    const plannedExercise = {
      id: 'rutina-ejercicio-1',
      exerciseId: 'sentadilla',
      order: 0,
      targetSets: 3,
      targetReps: 10,
      targetWeightKg: 50,
      notes: null,
      exercise: { id: 'sentadilla', name: 'Sentadilla' },
    };
    const workout = { id: 'entrenamiento-1', userId: 'usuario-1', sets: [] };
    const findUnique = jest.fn(({ include }) =>
      Promise.resolve(
        include?.routine
          ? { ...workout, routine: { id: 'rutina-1', name: 'Pierna', exercises: [plannedExercise] } }
          : workout,
      ),
    );
    const prisma = { workout: { findUnique } } as unknown as PrismaService;
    const service = new WorkoutsService(prisma, {} as ServicioSesionActiva);

    const result = await service.get('usuario-1', 'entrenamiento-1');

    expect((result as any).routine?.exercises).toEqual([plannedExercise]);
  });

  it('no recalcula estadísticas al finalizar una sesión que ya terminó', async () => {
    const finishedWorkout = {
      id: 'entrenamiento-1',
      userId: 'usuario-1',
      endedAt: new Date('2026-08-13T10:00:00.000Z'),
    };
    const prisma = {
      workout: {
        findUnique: jest.fn().mockResolvedValue(finishedWorkout),
        update: jest.fn().mockResolvedValue(finishedWorkout),
      },
      workoutSet: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new WorkoutsService(prisma, {} as ServicioSesionActiva);

    await expect(service.finish('usuario-1', 'entrenamiento-1', {})).resolves.toBe(finishedWorkout);
    expect(prisma.workout.update).not.toHaveBeenCalled();
    expect(prisma.workoutSet.findMany).not.toHaveBeenCalled();
  });

  it('rechaza registrar series cuando la sesión ya finalizó', async () => {
    const prisma = {
      workout: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'entrenamiento-1',
          userId: 'usuario-1',
          endedAt: new Date('2026-08-13T10:00:00.000Z'),
        }),
      },
      workoutSet: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new WorkoutsService(prisma, {} as ServicioSesionActiva);

    await expect(
      service.addSet('usuario-1', 'entrenamiento-1', {
        exerciseId: 'sentadilla',
        order: 1,
        weightKg: 50,
        reps: 8,
      }),
    ).rejects.toThrow('No puedes registrar series en una sesión finalizada.');
    expect(prisma.workoutSet.create).not.toHaveBeenCalled();
  });
});
