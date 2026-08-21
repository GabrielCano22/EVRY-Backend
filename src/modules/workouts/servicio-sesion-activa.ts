import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CycleService } from '../cycle/cycle.service';

interface DatosNuevaSesion {
  name: string;
  notes?: string;
  routineId?: string;
}

@Injectable()
export class ServicioSesionActiva {
  constructor(
    private prisma: PrismaService,
    private ciclo: CycleService,
  ) {}

  async iniciarOContinuar(userId: string, datos: DatosNuevaSesion) {
    const activa = await this.prisma.workout.findFirst({
      where: { userId, endedAt: null, cancelledAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (activa) return activa;

    const fase = await this.ciclo.currentPhase(userId).catch(() => null);
    return this.prisma.workout.create({
      data: { userId, ...datos, cyclePhase: fase ?? undefined },
    });
  }
}
