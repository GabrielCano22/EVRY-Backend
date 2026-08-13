import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CycleService } from '../cycle/cycle.service';

export interface Recommendation {
  exerciseId: string;
  targetWeightKg: number | null;
  targetReps: number | null;
  rationale: string[];
  confidence: number; // 0-1
  action: 'PROGRESS' | 'HOLD' | 'DELOAD' | 'NEW';
}

@Injectable()
export class AdaptiveService {
  constructor(private prisma: PrismaService, private cycle: CycleService) {}

  async recommend(userId: string, exerciseId: string): Promise<Recommendation> {
    const recentSets = await this.prisma.workoutSet.findMany({
      where: {
        exerciseId,
        isWarmup: false,
        workout: { userId, endedAt: { not: null } },
        weightKg: { not: null },
        reps: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: 30,
      include: { workout: true },
    });

    if (recentSets.length === 0) {
      return {
        exerciseId,
        targetWeightKg: null,
        targetReps: 8,
        rationale: ['Primer registro: sugerimos peso liviano técnica primero.'],
        confidence: 0.3,
        action: 'NEW',
      };
    }

    // group by workout, take 2 most recent sessions
    const byWorkout = new Map<string, typeof recentSets>();
    for (const s of recentSets) {
      const arr = byWorkout.get(s.workoutId) ?? [];
      arr.push(s);
      byWorkout.set(s.workoutId, arr);
    }
    const sessions = [...byWorkout.values()].slice(0, 3);
    const last = sessions[0];
    const prev = sessions[1];

    const lastTopWeight = Math.max(...last.map((s) => s.weightKg ?? 0));
    const lastTopSet = last.find((s) => (s.weightKg ?? 0) === lastTopWeight)!;
    const lastReps = lastTopSet.reps ?? 0;
    const lastRpe = lastTopSet.rpe ?? 8;

    const rationale: string[] = [];
    let action: Recommendation['action'] = 'HOLD';
    let targetWeight = lastTopWeight;
    let targetReps = lastReps;

    // Cycle modulation
    const phaseInfo = await this.cycle.phaseInfo(userId);
    let intensityCap = 1.0;
    if (phaseInfo) {
      intensityCap = phaseInfo.intensityCap;
      rationale.push(`Fase ${phaseInfo.phase.toLowerCase()}: ${phaseInfo.trainingHint}`);
    }

    // Progression rule
    if (lastRpe <= 8 && lastReps >= targetReps) {
      const inc = lastTopWeight >= 60 ? 2.5 : 1.0;
      targetWeight = Math.round((lastTopWeight + inc) * intensityCap * 2) / 2;
      action = 'PROGRESS';
      rationale.push(`Última sesión RPE ${lastRpe} ≤ 8, completaste ${lastReps} repeticiones. Sube ${inc} kg.`);
    } else if (prev) {
      const prevTopWeight = Math.max(...prev.map((s) => s.weightKg ?? 0));
      const stalled = lastTopWeight <= prevTopWeight && lastRpe >= 9;
      if (stalled) {
        targetWeight = Math.round(lastTopWeight * 0.9 * 2) / 2;
        action = 'DELOAD';
        rationale.push(`Estancado 2 sesiones con RPE ≥ 9. Descarga 10% para reiniciar.`);
      } else {
        rationale.push(`Mantén el peso, busca mejorar repeticiones o velocidad.`);
      }
    }

    // Readiness override
    const readiness = await this.prisma.readiness.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    if (readiness && readiness.score < 50 && action === 'PROGRESS') {
      action = 'HOLD';
      targetWeight = lastTopWeight;
      rationale.push(`Estado diario ${readiness.score.toFixed(0)}/100 bajo: posponemos la progresión.`);
    }

    const confidence = Math.min(1, sessions.length / 3) * (phaseInfo ? 1 : 0.85);

    return {
      exerciseId,
      targetWeightKg: targetWeight,
      targetReps,
      rationale,
      confidence,
      action,
    };
  }
}
