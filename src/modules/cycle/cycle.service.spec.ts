import { PrismaService } from '../../prisma/prisma.service';
import { CycleService } from './cycle.service';

describe('CycleService', () => {
  it('mueve un registro al cambiar la fecha sin dejar la entrada anterior', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'nuevo' });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { cycleEntry: { upsert, deleteMany } };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ trackCycle: true }) },
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
      user: { findUnique: jest.fn().mockResolvedValue({ trackCycle: true }) },
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

  it('rechaza registros cuando el usuario no activó voluntariamente el seguimiento', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ trackCycle: false }) },
      cycleEntry: { upsert: jest.fn() },
    } as unknown as PrismaService;
    const service = new CycleService(prisma);

    await expect(service.upsertEntry('usuario-1', { date: '2026-08-20' }))
      .rejects.toThrow(/activa/i);
    expect(prisma.cycleEntry.upsert).not.toHaveBeenCalled();
  });

  it('rechaza fechas futuras y rangos invertidos en Bogotá', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ trackCycle: true }) },
      cycleEntry: { upsert: jest.fn(), findMany: jest.fn() },
    } as unknown as PrismaService;
    const service = new CycleService(prisma);

    await expect(
      service.upsertEntry('usuario-1', { date: '2026-08-29' }, new Date('2026-08-28T15:00:00.000Z')),
    ).rejects.toThrow('futuras');
    await expect(
      service.list('usuario-1', '2026-08-20', '2026-08-19', new Date('2026-08-28T15:00:00.000Z')),
    ).rejects.toThrow('posterior');
  });

  it('elimina únicamente una entrada perteneciente al usuario', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ trackCycle: true }) },
      cycleEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaService;
    const service = new CycleService(prisma);

    await expect(service.removeEntry('usuario-1', 'entry-1')).resolves.toEqual({ ok: true });
    expect(prisma.cycleEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: 'entry-1', userId: 'usuario-1' },
    });
  });
});
