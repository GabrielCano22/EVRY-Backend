import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live() {
    return { status: 'ok' } as const;
  }

  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1 AS ready`;
      return { status: 'ok', database: 'ready' } as const;
    } catch {
      throw new ServiceUnavailableException('El servicio de datos no está disponible.');
    }
  }
}
