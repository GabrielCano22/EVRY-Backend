import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  it('hace upsert del check-in para la fecha civil de Bogotá', async () => {
    const readiness = { id: 'ready-1', date: new Date('2026-08-28T00:00:00.000Z') };
    const prisma = { readiness: { upsert: jest.fn().mockResolvedValue(readiness) } };
    const service = new ReadinessService(prisma as never);

    await expect(
      service.checkin('user-1', { sleepHrs: 8 }, new Date('2026-08-28T12:00:00.000Z')),
    ).resolves.toEqual(readiness);

    expect(prisma.readiness.upsert).toHaveBeenCalledWith({
      where: { userId_civilDate: { userId: 'user-1', civilDate: new Date('2026-08-28T00:00:00.000Z') } },
      create: { userId: 'user-1', civilDate: new Date('2026-08-28T00:00:00.000Z'), sleepHrs: 8, score: 75 },
      update: { sleepHrs: 8, score: 75 },
    });
  });

  it('solo devuelve readiness si pertenece al día civil actual', async () => {
    const prisma = { readiness: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ReadinessService(prisma as never);

    await expect(service.latest('user-1', new Date('2026-08-28T12:00:00.000Z'))).resolves.toBeNull();
    expect(prisma.readiness.findUnique).toHaveBeenCalledWith({
      where: { userId_civilDate: { userId: 'user-1', civilDate: new Date('2026-08-28T00:00:00.000Z') } },
    });
  });
});
