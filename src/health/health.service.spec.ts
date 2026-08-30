import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reporta el proceso vivo sin consultar dependencias', () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new HealthService(prisma as never);

    expect(service.live()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reporta preparación después de consultar PostgreSQL', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]) };
    const service = new HealthService(prisma as never);

    await expect(service.ready()).resolves.toEqual({ status: 'ok', database: 'ready' });
  });

  it('devuelve 503 cuando PostgreSQL no está disponible', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('password=secret')) };
    const service = new HealthService(prisma as never);

    await expect(service.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
