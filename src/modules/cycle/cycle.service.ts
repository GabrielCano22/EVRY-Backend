import { Injectable, BadRequestException } from '@nestjs/common';
import { CyclePhase } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertCycleEntryDto } from './dto/cycle.dto';

export interface PhaseInfo {
  phase: CyclePhase;
  dayOfCycle: number;
  cycleLength: number;
  nextPeriodStart: Date | null;
  trainingHint: string;
  intensityCap: number; // 0-1 multiplier suggestion
  volumeCap: number;
}

@Injectable()
export class CycleService {
  constructor(private prisma: PrismaService) {}

  async upsertEntry(userId: string, dto: UpsertCycleEntryDto) {
    const { date: dateStr, ...rest } = dto;
    const date = new Date(dateStr);
    return this.prisma.cycleEntry.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, ...rest },
      update: { ...rest, date },
    });
  }

  list(userId: string, from?: string, to?: string) {
    return this.prisma.cycleEntry.findMany({
      where: {
        userId,
        date: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      orderBy: { date: 'desc' },
      take: 180,
    });
  }

  async currentPhase(userId: string): Promise<CyclePhase | null> {
    const info = await this.phaseInfo(userId);
    return info?.phase ?? null;
  }

  async phaseInfo(userId: string): Promise<PhaseInfo | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.trackCycle) return null;

    const lastStarts = await this.prisma.cycleEntry.findMany({
      where: { userId, isPeriodStart: true },
      orderBy: { date: 'desc' },
      take: 6,
    });
    if (lastStarts.length === 0) return null;

    const cycleLen = this.computeCycleLength(lastStarts.map((e) => e.date), user.avgCycleLen);
    const lastStart = lastStarts[0].date;
    const today = startOfDay(new Date());
    const day = Math.floor((today.getTime() - startOfDay(lastStart).getTime()) / 86400000) + 1;
    const dayOfCycle = ((day - 1) % cycleLen) + 1;

    const phase = this.phaseOf(dayOfCycle, cycleLen, user.avgPeriodLen);
    const nextPeriodStart = new Date(startOfDay(lastStart).getTime() + cycleLen * 86400000);

    const hint = this.trainingHint(phase);
    return {
      phase,
      dayOfCycle,
      cycleLength: cycleLen,
      nextPeriodStart,
      trainingHint: hint.text,
      intensityCap: hint.intensityCap,
      volumeCap: hint.volumeCap,
    };
  }

  private computeCycleLength(starts: Date[], fallback: number): number {
    if (starts.length < 2) return fallback;
    const sorted = [...starts].sort((a, b) => a.getTime() - b.getTime());
    const diffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      diffs.push(Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000));
    }
    diffs.sort((a, b) => a - b);
    const median = diffs[Math.floor(diffs.length / 2)];
    if (median < 20 || median > 45) return fallback;
    return median;
  }

  private phaseOf(day: number, cycleLen: number, periodLen: number): CyclePhase {
    if (day <= periodLen) return 'MENSTRUAL';
    const ovulationDay = cycleLen - 14;
    if (day >= ovulationDay - 1 && day <= ovulationDay + 1) return 'OVULATION';
    if (day < ovulationDay) return 'FOLLICULAR';
    return 'LUTEAL';
  }

  private trainingHint(phase: CyclePhase) {
    switch (phase) {
      case 'MENSTRUAL':
        return { text: 'Energía baja posible. Movilidad, técnica, cardio suave. RPE ≤ 7.', intensityCap: 0.85, volumeCap: 0.85 };
      case 'FOLLICULAR':
        return { text: 'Pico de fuerza y recuperación. Buen momento para buscar marcas personales e intensidad alta.', intensityCap: 1.05, volumeCap: 1.0 };
      case 'OVULATION':
        return { text: 'Máximo rendimiento neuromuscular. Prioriza ejercicios compuestos.', intensityCap: 1.05, volumeCap: 1.0 };
      case 'LUTEAL':
        return { text: 'Energía variable. Volumen moderado, evita llegar al fallo. RPE ≤ 8.', intensityCap: 0.95, volumeCap: 0.9 };
    }
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
