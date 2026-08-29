import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CyclePhase } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertCycleEntryDto } from './dto/cycle.dto';
import {
  assertCivilDateRange,
  CivilDate,
  parseCivilDate,
  todayCivilDate,
} from '../../common/dates/civil-date';

export interface PhaseInfo {
  phase: CyclePhase;
  dayOfCycle: number;
  cycleLength: number;
  nextPeriodStart: CivilDate | null;
  trainingHint: string;
  intensityCap: number; // 0-1 multiplier suggestion
  volumeCap: number;
}

@Injectable()
export class CycleService {
  constructor(private prisma: PrismaService) {}

  async upsertEntry(userId: string, dto: UpsertCycleEntryDto, now: Date = new Date()) {
    await this.assertOptIn(userId);
    const { date: dateStr, previousDate: previousDateStr, ...rest } = dto;
    const today = todayCivilDate(undefined, now);
    const dateLabel = this.civilDate(dateStr);
    assertCivilDateRange(dateLabel, dateLabel, today);
    const date = this.databaseDate(dateLabel);
    const previousDateLabel = previousDateStr ? this.civilDate(previousDateStr) : null;
    if (previousDateLabel) assertCivilDateRange(previousDateLabel, previousDateLabel, today);
    const previousDate = previousDateLabel ? this.databaseDate(previousDateLabel) : null;

    const guardar = (client: Pick<PrismaService, 'cycleEntry'>) =>
      client.cycleEntry.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, ...rest },
        update: { ...rest, date },
      });

    // Mover un registro a otra fecha debe retirar el registro anterior para
    // que el calendario no conserve síntomas o flujo obsoletos. La operación
    // se mantiene atómica para evitar duplicados si el usuario pulsa guardar.
    if (previousDate && previousDate.getTime() !== date.getTime()) {
      return this.prisma.$transaction(async (tx) => {
        await tx.cycleEntry.deleteMany({ where: { userId, date: previousDate } });
        return guardar(tx);
      });
    }

    return guardar(this.prisma);
  }

  async list(userId: string, from?: string, to?: string, now: Date = new Date()) {
    await this.assertOptIn(userId);
    const today = todayCivilDate(undefined, now);
    const fromLabel = from ? this.civilDate(from) : undefined;
    const toLabel = to ? this.civilDate(to) : today;
    if (fromLabel) assertCivilDateRange(fromLabel, toLabel, today);
    else assertCivilDateRange(toLabel, toLabel, today);
    return this.prisma.cycleEntry.findMany({
      where: {
        userId,
        date: {
          gte: fromLabel ? this.databaseDate(fromLabel) : undefined,
          lte: to ? this.databaseDate(toLabel) : undefined,
        },
      },
      orderBy: { date: 'desc' },
      take: 180,
    });
  }

  async removeEntry(userId: string, id: string) {
    await this.assertOptIn(userId);
    const result = await this.prisma.cycleEntry.deleteMany({ where: { id, userId } });
    if (result.count !== 1) throw new NotFoundException();
    return { ok: true };
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
    const lastStart = this.databaseDateLabel(lastStarts[0].date);
    const today = todayCivilDate();
    const day = this.dayDifference(lastStart, today) + 1;
    const dayOfCycle = ((day - 1) % cycleLen) + 1;

    const phase = this.phaseOf(dayOfCycle, cycleLen, user.avgPeriodLen);
    const nextPeriodStart = this.addCivilDays(lastStart, cycleLen);

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
    const sorted = starts.map((date) => this.databaseDateLabel(date)).sort();
    const diffs: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      diffs.push(this.dayDifference(sorted[i - 1], sorted[i]));
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
        return { text: 'El contexto y la energía pueden variar; ajusta por sensaciones.', intensityCap: 1, volumeCap: 1 };
      case 'FOLLICULAR':
        return { text: 'Usa tus sesiones recientes y tu readiness para decidir la carga.', intensityCap: 1, volumeCap: 1 };
      case 'OVULATION':
        return { text: 'Este dato es estimado y no implica un pico de rendimiento.', intensityCap: 1, volumeCap: 1 };
      case 'LUTEAL':
        return { text: 'La energía puede variar; prioriza tu respuesta individual.', intensityCap: 1, volumeCap: 1 };
    }
  }

  private async assertOptIn(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trackCycle: true },
    });
    if (!user?.trackCycle) {
      throw new BadRequestException('Activa voluntariamente el seguimiento del ciclo para usar esta función.');
    }
  }

  private civilDate(value: string): CivilDate {
    parseCivilDate(value);
    return value as CivilDate;
  }

  private databaseDate(value: CivilDate): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private databaseDateLabel(value: Date): CivilDate {
    return value.toISOString().slice(0, 10) as CivilDate;
  }

  private dayDifference(from: CivilDate, to: CivilDate): number {
    return Math.round((this.databaseDate(to).getTime() - this.databaseDate(from).getTime()) / 86400000);
  }

  private addCivilDays(value: CivilDate, days: number): CivilDate {
    const result = this.databaseDate(value);
    result.setUTCDate(result.getUTCDate() + days);
    return this.databaseDateLabel(result);
  }
}
