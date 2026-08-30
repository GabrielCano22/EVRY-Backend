import type {
  Estimated1RMRecord,
  ExerciseMetricSet,
  ExerciseMetricSnapshot,
  OverviewMetrics,
  PeriodMetrics,
} from './progress.types';

export function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function isEligible(row: ExerciseMetricSet, userId: string): row is ExerciseMetricSet & { endedAt: Date } {
  return row.userId === userId
    && row.endedAt !== null
    && row.cancelledAt === null
    && !row.isWarmup
    && ((row.reps ?? 0) > 0 || (row.durationS ?? 0) > 0);
}

function isNewer(left: ExerciseMetricSet, right: ExerciseMetricSet): boolean {
  const timeDifference = left.completedAt.getTime() - right.completedAt.getTime();
  return timeDifference > 0 || (timeDifference === 0 && left.setId > right.setId);
}

function selectRecord(
  rows: ExerciseMetricSet[],
  value: (row: ExerciseMetricSet) => number | null,
): ExerciseMetricSet | null {
  let selected: ExerciseMetricSet | null = null;
  let selectedValue: number | null = null;
  for (const row of rows) {
    const currentValue = value(row);
    if (currentValue === null) continue;
    if (
      selected === null
      || selectedValue === null
      || currentValue > selectedValue
      || (currentValue === selectedValue && isNewer(row, selected))
    ) {
      selected = row;
      selectedValue = currentValue;
    }
  }
  return selected;
}

function epley(row: ExerciseMetricSet): number | null {
  if ((row.weightKg ?? 0) <= 0 || (row.reps ?? 0) <= 0) return null;
  return (row.weightKg as number) * (1 + (row.reps as number) / 30);
}

export function calculateExerciseMetricSnapshot(
  rows: readonly ExerciseMetricSet[],
  userId: string,
): ExerciseMetricSnapshot {
  const eligible = rows.filter((row) => isEligible(row, userId));
  const bestWeightSet = selectRecord(eligible, (row) =>
    (row.weightKg ?? 0) > 0 ? row.weightKg : null,
  );
  const repetitionSet = selectRecord(eligible, (row) =>
    (row.reps ?? 0) > 0 ? row.reps : null,
  );
  const epleySet = selectRecord(eligible, epley);
  const volumeKg = eligible.reduce(
    (sum, row) => sum + ((row.weightKg ?? 0) > 0 && (row.reps ?? 0) > 0
      ? (row.weightKg as number) * (row.reps as number)
      : 0),
    0,
  );

  const estimated1RM: Estimated1RMRecord | null = epleySet
    ? {
      valueKg: roundMetric(epley(epleySet) as number),
      weightKg: epleySet.weightKg as number,
      reps: epleySet.reps as number,
      achievedAt: epleySet.completedAt.toISOString(),
      workoutId: epleySet.workoutId,
      formula: 'EPLEY',
    }
    : null;

  return {
    metrics: {
      sessionsCount: new Set(eligible.map(({ workoutId }) => workoutId)).size,
      workingSetsCount: eligible.length,
      volumeKg: roundMetric(volumeKg),
      bestWeightKg: bestWeightSet ? roundMetric(bestWeightSet.weightKg as number) : null,
      estimated1RMKg: estimated1RM?.valueKg ?? null,
    },
    bestWeight: bestWeightSet
      ? {
        weightKg: roundMetric(bestWeightSet.weightKg as number),
        achievedAt: bestWeightSet.completedAt.toISOString(),
        workoutId: bestWeightSet.workoutId,
      }
      : null,
    repetitionRecord: repetitionSet
      ? {
        reps: repetitionSet.reps as number,
        weightKg: repetitionSet.weightKg === null ? null : roundMetric(repetitionSet.weightKg),
        achievedAt: repetitionSet.completedAt.toISOString(),
        workoutId: repetitionSet.workoutId,
      }
      : null,
    estimated1RM,
  };
}

function nullableDelta(current: number | null, previous: number | null): number | null {
  if (current === null && previous === null) return null;
  return roundMetric((current ?? 0) - (previous ?? 0));
}

export function deltaPeriodMetrics(current: PeriodMetrics, previous: PeriodMetrics): PeriodMetrics {
  return {
    sessionsCount: current.sessionsCount - previous.sessionsCount,
    workingSetsCount: current.workingSetsCount - previous.workingSetsCount,
    volumeKg: roundMetric(current.volumeKg - previous.volumeKg),
    bestWeightKg: nullableDelta(current.bestWeightKg, previous.bestWeightKg),
    estimated1RMKg: nullableDelta(current.estimated1RMKg, previous.estimated1RMKg),
  };
}

export function deltaOverviewMetrics(
  current: OverviewMetrics,
  previous: OverviewMetrics,
): OverviewMetrics {
  return {
    sessionsCompleted: current.sessionsCompleted - previous.sessionsCompleted,
    volumeKg: roundMetric(current.volumeKg - previous.volumeKg),
    activeDays: current.activeDays - previous.activeDays,
    weeklyFrequency: roundMetric(current.weeklyFrequency - previous.weeklyFrequency),
  };
}
