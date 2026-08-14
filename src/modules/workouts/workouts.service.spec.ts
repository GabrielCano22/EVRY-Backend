import { PrismaService } from '../../prisma/prisma.service';
import { CycleService } from '../cycle/cycle.service';
import { WorkoutsService } from './workouts.service';

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
    const service = new WorkoutsService(prisma, {} as CycleService);

    const result = await service.get('usuario-1', 'entrenamiento-1');

    expect((result as any).routine?.exercises).toEqual([plannedExercise]);
  });
});
