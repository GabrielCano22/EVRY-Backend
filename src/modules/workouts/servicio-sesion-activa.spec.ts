import { PrismaService } from '../../prisma/prisma.service';
import { CycleService } from '../cycle/cycle.service';
import { ServicioSesionActiva } from './servicio-sesion-activa';

describe('ServicioSesionActiva', () => {
  it('reutiliza la sesión activa en lugar de crear una segunda', async () => {
    const activa = { id: 'entrenamiento-activo', userId: 'usuario-1', endedAt: null };
    const prismaMock = {
      workout: {
        findFirst: jest.fn().mockResolvedValue(activa),
        create: jest.fn(),
      },
    };
    const servicio = new ServicioSesionActiva(
      prismaMock as unknown as PrismaService,
      {} as CycleService,
    );

    await expect(
      servicio.iniciarOContinuar('usuario-1', {
        name: 'Rutina de piernas',
        routineId: 'rutina-1',
      }),
    ).resolves.toBe(activa);
    expect(prismaMock.workout.findFirst).toHaveBeenCalledWith({
      where: { userId: 'usuario-1', endedAt: null, cancelledAt: null },
      orderBy: { startedAt: 'desc' },
    });
    expect(prismaMock.workout.create).not.toHaveBeenCalled();
  });

  it('crea una sesión con la fase actual cuando no hay una en curso', async () => {
    const creada = { id: 'entrenamiento-nuevo', userId: 'usuario-1', endedAt: null };
    const prismaMock = {
      workout: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(creada),
      },
    };
    const ciclo = { currentPhase: jest.fn().mockResolvedValue('FOLLICULAR') } as unknown as CycleService;
    const servicio = new ServicioSesionActiva(prismaMock as unknown as PrismaService, ciclo);

    await expect(
      servicio.iniciarOContinuar('usuario-1', { name: 'Sesión rápida', notes: 'Piernas' }),
    ).resolves.toBe(creada);
    expect(prismaMock.workout.create).toHaveBeenCalledWith({
      data: {
        userId: 'usuario-1',
        name: 'Sesión rápida',
        notes: 'Piernas',
        cyclePhase: 'FOLLICULAR',
      },
    });
  });
});
