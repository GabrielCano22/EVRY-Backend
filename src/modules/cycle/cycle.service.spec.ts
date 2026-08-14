import { PrismaService } from '../../prisma/prisma.service';
import { CycleService } from './cycle.service';

describe('CycleService', () => {
  it('mueve un registro al cambiar la fecha sin dejar la entrada anterior', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'nuevo' });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { cycleEntry: { upsert, deleteMany } };
    const prisma = {
      cycleEntry: { upsert: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new CycleService(prisma);

    await service.upsertEntry('usuario-1', {
      date: '2026-08-20',
      previousDate: '2026-08-19',
      symptoms: ['fatiga'],
      isPeriodStart: false,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'usuario-1', date: new Date('2026-08-19') },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_date: { userId: 'usuario-1', date: new Date('2026-08-20') } },
        create: expect.objectContaining({ symptoms: ['fatiga'], isPeriodStart: false }),
      }),
    );
  });

  it('actualiza la misma fecha sin abrir una transacción de traslado', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'existente' });
    const prisma = {
      cycleEntry: { upsert },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new CycleService(prisma);

    await service.upsertEntry('usuario-1', {
      date: '2026-08-20',
      previousDate: '2026-08-20',
      flow: 'MEDIUM' as any,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
