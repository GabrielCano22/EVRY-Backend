import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  it('suma el volumen de cada serie en vez de multiplicar acumulados', async () => {
    const prismaMock = {
      workout: { count: jest.fn().mockResolvedValue(2) },
      exerciseStat: { findMany: jest.fn().mockResolvedValue([]) },
      workoutSet: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { weightKg: 110, reps: 15 } }),
        findMany: jest.fn().mockResolvedValue([
          { weightKg: 50, reps: 10 },
          { weightKg: 60, reps: 5 },
        ]),
      },
    };
    const service = new ProgressService(prismaMock as unknown as PrismaService);

    const result = await service.overview('usuario-1');

    expect(result.volumeKg).toBe(800);
  });
});
