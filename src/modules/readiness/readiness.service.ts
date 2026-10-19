import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { todayCivilDate } from '../../common/dates/civil-date';

export interface CheckinDto {
  sleepHrs?: number | null;
  stress?: number | null;
  soreness?: number | null;
  motivation?: number | null;
}

@Injectable()
export class ReadinessService {
  constructor(private prisma: PrismaService) {}

  async checkin(userId: string, dto: CheckinDto, now: Date = new Date()) {
    const civilDate = this.databaseCivilDate(now);
    return this.prisma.$transaction(async (tx) => {
      // Serialize first creation as well as partial updates for this civil day.
      const lock = `evry:readiness:${userId}:${civilDate.toISOString()}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
      const where = { userId_civilDate: { userId, civilDate } };
      const previous = await tx.readiness.findUnique({ where });
      const inputs: CheckinDto = {
        sleepHrs: dto.sleepHrs === undefined ? previous?.sleepHrs : dto.sleepHrs,
        stress: dto.stress === undefined ? previous?.stress : dto.stress,
        soreness: dto.soreness === undefined ? previous?.soreness : dto.soreness,
        motivation: dto.motivation === undefined ? previous?.motivation : dto.motivation,
      };
      const score = this.score(inputs);
      return tx.readiness.upsert({
        where,
        create: { userId, civilDate, ...inputs, score },
        update: { ...inputs, score },
      });
    });
  }

  latest(userId: string, now: Date = new Date()) {
    const civilDate = this.databaseCivilDate(now);
    return this.prisma.readiness.findUnique({
      where: { userId_civilDate: { userId, civilDate } },
    });
  }

  private databaseCivilDate(now: Date): Date {
    return new Date(`${todayCivilDate(undefined, now)}T00:00:00.000Z`);
  }

  // Score 0-100. Sleep weighted heaviest. Lower stress/soreness = higher.
  private score(d: CheckinDto): number {
    const sleep = clamp((d.sleepHrs ?? 7) / 8, 0, 1);          // 8h ideal
    const stress = 1 - clamp(((d.stress ?? 3) - 1) / 4, 0, 1);
    const soreness = 1 - clamp(((d.soreness ?? 2) - 1) / 4, 0, 1);
    const motivation = clamp(((d.motivation ?? 3) - 1) / 4, 0, 1);
    const w = sleep * 0.4 + stress * 0.2 + soreness * 0.2 + motivation * 0.2;
    return Math.round(w * 100);
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
