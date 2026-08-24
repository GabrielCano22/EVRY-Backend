import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockWorkoutLifecycle } from './serializable-transaction';

interface EligibleSet {
  id: string;
  workoutId: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  completedAt: Date;
}

function isNewer(left: EligibleSet, right: EligibleSet): boolean {
  const dateDifference = left.completedAt.getTime() - right.completedAt.getTime();
  return dateDifference > 0 || (dateDifference === 0 && left.id > right.id);
}

function pickRecord(
  sets: readonly EligibleSet[],
  value: (set: EligibleSet) => number | null,
): EligibleSet | undefined {
  let best: EligibleSet | undefined;
  let bestValue: number | null = null;

  for (const set of sets) {
    const candidateValue = value(set);
    if (candidateValue === null) continue;
    if (
      best === undefined
      || bestValue === null
      || candidateValue > bestValue
      || (candidateValue === bestValue && isNewer(set, best))
    ) {
      best = set;
      bestValue = candidateValue;
    }
  }

  return best;
}

@Injectable()
export class ExerciseStatsService {
  async rebuildExerciseStats(
    tx: Prisma.TransactionClient,
    userId: string,
    exerciseIds: readonly string[],
  ): Promise<void> {
    const affectedExerciseIds = [...new Set(exerciseIds)].sort();
    if (affectedExerciseIds.length === 0) return;

    await lockWorkoutLifecycle(tx, userId);

    const sets = await tx.workoutSet.findMany({
      where: {
        exerciseId: { in: affectedExerciseIds },
        isWarmup: false,
        OR: [{ reps: { gt: 0 } }, { durationS: { gt: 0 } }],
        workout: { userId, endedAt: { not: null }, cancelledAt: null },
      },
      select: {
        id: true,
        workoutId: true,
        exerciseId: true,
        weightKg: true,
        reps: true,
        durationS: true,
        completedAt: true,
      },
    });

    const byExercise = new Map<string, EligibleSet[]>();
    for (const set of sets) {
      const exerciseSets = byExercise.get(set.exerciseId) ?? [];
      exerciseSets.push(set);
      byExercise.set(set.exerciseId, exerciseSets);
    }

    const replacementRows: Prisma.ExerciseStatCreateManyInput[] = [];
    for (const exerciseId of affectedExerciseIds) {
      const exerciseSets = byExercise.get(exerciseId);
      if (!exerciseSets?.length) continue;

      const bestWeight = pickRecord(
        exerciseSets,
        (set) => set.weightKg !== null && set.weightKg > 0 ? set.weightKg : null,
      );
      const bestReps = pickRecord(
        exerciseSets,
        (set) => set.reps !== null && set.reps > 0 ? set.reps : null,
      );
      const bestEpley = pickRecord(
        exerciseSets,
        (set) => set.weightKg !== null && set.weightKg > 0 && set.reps !== null && set.reps > 0
          ? set.weightKg * (1 + set.reps / 30)
          : null,
      );
      const lastSet = exerciseSets.reduce((latest, set) => isNewer(set, latest) ? set : latest);
      const estimated1RM = bestEpley?.weightKg && bestEpley.reps
        ? bestEpley.weightKg * (1 + bestEpley.reps / 30)
        : 0;

      replacementRows.push({
        userId,
        exerciseId,
        estimated1RM,
        bestWeight: bestWeight?.weightKg ?? 0,
        bestReps: bestReps?.reps ?? 0,
        lastSetAt: lastSet.completedAt,
        trendSlope: 0,
        sessionsCount: new Set(exerciseSets.map(({ workoutId }) => workoutId)).size,
        bestWeightAt: bestWeight?.completedAt ?? null,
        bestRepsWeightKg: bestReps?.weightKg ?? null,
        bestRepsAt: bestReps?.completedAt ?? null,
        estimated1RMAt: bestEpley?.completedAt ?? null,
        estimated1RMWeightKg: bestEpley?.weightKg ?? null,
        estimated1RMReps: bestEpley?.reps ?? null,
      });
    }

    await tx.exerciseStat.deleteMany({
      where: { userId, exerciseId: { in: affectedExerciseIds } },
    });
    if (replacementRows.length > 0) {
      await tx.exerciseStat.createMany({ data: replacementRows });
    }
  }
}
