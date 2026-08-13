import { RoutinesService } from './routines.service';

describe('RoutinesService', () => {
  it('rechaza ejercicios repetidos dentro de una misma rutina', async () => {
    const prisma = {
      routine: { create: jest.fn() },
    };
    const service = new RoutinesService(prisma as never, {} as never);

    await expect(
      service.create('user-1', {
        name: 'Rutina de prueba',
        exercises: [
          { exerciseId: 'exercise-1', order: 0, targetSets: 3 },
          { exerciseId: 'exercise-1', order: 1, targetSets: 3 },
        ],
      }),
    ).rejects.toThrow('No puedes repetir un ejercicio en la misma rutina.');
    expect(prisma.routine.create).not.toHaveBeenCalled();
  });
});
