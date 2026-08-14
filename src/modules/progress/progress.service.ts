import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async overview(userId: string) {
    const since = new Date(Date.now() - 30 * 86400000);
    const [workouts, stats, series] = await Promise.all([
      this.prisma.workout.count({ where: { userId, endedAt: { not: null, gte: since } } }),
      this.prisma.exerciseStat.findMany({
        where: { userId },
        orderBy: { lastSetAt: 'desc' },
        include: { exercise: true },
        take: 10,
      }),
      this.prisma.workoutSet.findMany({
        where: { workout: { userId, endedAt: { gte: since } }, isWarmup: false },
        select: { weightKg: true, reps: true },
      }),
    ]);
    const volumeKg = series.reduce(
      (total, serie) => total + (serie.weightKg ?? 0) * (serie.reps ?? 0),
      0,
    );

    return {
      windowDays: 30,
      workoutsCompleted: workouts,
      volumeKg,
      topExercises: stats.map((s) => ({
        exerciseId: s.exerciseId,
        name: s.exercise.name,
        estimated1RM: Math.round(s.estimated1RM * 10) / 10,
        bestWeight: s.bestWeight,
        bestReps: s.bestReps,
        trendSlope: Math.round(s.trendSlope * 10) / 10,
        sessionsCount: s.sessionsCount,
      })),
    };
  }

  async exerciseHistory(userId: string, exerciseId: string) {
    return this.prisma.workoutSet.findMany({
      where: {
        exerciseId,
        workout: { userId, endedAt: { not: null } },
        isWarmup: false,
      },
      orderBy: { completedAt: 'asc' },
      take: 200,
      select: { weightKg: true, reps: true, rpe: true, completedAt: true },
    });
  }
}
