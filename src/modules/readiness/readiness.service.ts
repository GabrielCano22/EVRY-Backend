import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CheckinDto {
  sleepHrs?: number;
  stress?: number;
  soreness?: number;
  motivation?: number;
}

@Injectable()
export class ReadinessService {
  constructor(private prisma: PrismaService) {}

  async checkin(userId: string, dto: CheckinDto) {
    const score = this.score(dto);
    return this.prisma.readiness.create({
      data: { userId, ...dto, score },
    });
  }

  latest(userId: string) {
    return this.prisma.readiness.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
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
