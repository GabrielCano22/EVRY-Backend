import { RoutinesService } from './routines.service';
import { ServicioSesionActiva } from '../workouts/servicio-sesion-activa';

describe('RoutinesService', () => {
  it('persiste objetivos independientes para cada serie', async () => {
    const prisma = {
      routine: { create: jest.fn().mockResolvedValue({ id: 'routine-1' }) },
    };
    const service = new RoutinesService(prisma as never, {} as ServicioSesionActiva);
    const plan = [
      { reps: 12, weightKg: 20 },
      { reps: 10, weightKg: 22.5 },
      { reps: 8, weightKg: 25 },
    ];

    await service.create('user-1', {
      name: 'Rutina progresiva',
      exercises: [{ exerciseId: 'exercise-1', order: 0, targetSets: 3, seriesPlan: plan }],
    });

    expect(prisma.routine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          exercises: { create: [expect.objectContaining({ seriesPlan: plan })] },
        }),
      }),
    );
  });

  it('rechaza ejercicios repetidos dentro de una misma rutina', async () => {
    const prisma = {
      routine: { create: jest.fn() },
    };
    const service = new RoutinesService(prisma as never, {} as ServicioSesionActiva);

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
