import type { MuscleGroup } from '@prisma/client';
import type { CivilDate } from '../../common/dates/civil-date';

export type ProgressPeriod = '30d' | '90d' | '6m' | '1y' | 'all';

export interface PeriodMetrics {
  sessionsCount: number;
  workingSetsCount: number;
  volumeKg: number;
  bestWeightKg: number | null;
  estimated1RMKg: number | null;
}

export interface OverviewMetrics {
  sessionsCompleted: number;
  volumeKg: number;
  activeDays: number;
  weeklyFrequency: number;
}

export interface ProgressPeriodWindow {
  key: ProgressPeriod;
  from: CivilDate | null;
  to: CivilDate;
  timezone: 'America/Bogota';
  fromInclusive: Date | null;
  toExclusive: Date;
  previous: {
    from: CivilDate;
    to: CivilDate;
    fromInclusive: Date;
    toExclusive: Date;
  } | null;
}

export interface ActivityWindow {
  from: CivilDate;
  to: CivilDate;
  fromInclusive: Date;
  toExclusive: Date;
}

export interface ExerciseMetricSet {
  setId: string;
  workoutId: string;
  workoutName: string;
  userId: string;
  exerciseId: string;
  muscleGroup: MuscleGroup;
  endedAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date;
  isWarmup: boolean;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
}

export interface BestWeightRecord {
  weightKg: number;
  achievedAt: string;
  workoutId: string;
}

export interface RepetitionRecord {
  reps: number;
  weightKg: number | null;
  achievedAt: string;
  workoutId: string;
}

export interface Estimated1RMRecord {
  valueKg: number;
  weightKg: number;
  reps: number;
  achievedAt: string;
  workoutId: string;
  formula: 'EPLEY';
}

export interface ExerciseMetricSnapshot {
  metrics: PeriodMetrics;
  bestWeight: BestWeightRecord | null;
  repetitionRecord: RepetitionRecord | null;
  estimated1RM: Estimated1RMRecord | null;
}

export interface ExerciseProgressPoint {
  workoutId: string;
  workoutName: string;
  completedAt: string;
  maxWeightKg: number | null;
  estimated1RMKg: number | null;
  volumeKg: number;
}

export interface ExerciseHistorySet {
  id: string;
  order: number;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  rpe: number | null;
  completedAt: string;
}

export interface ExerciseHistorySession {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  endedAt: string;
  sets: ExerciseHistorySet[];
}

export interface ExerciseProgressResponse {
  exerciseId: string;
  period: {
    key: ProgressPeriod;
    from: CivilDate | null;
    to: CivilDate;
    timezone: 'America/Bogota';
  };
  summary: {
    sessionsCount: number;
    workingSetsCount: number;
    volumeKg: number;
    bestWeight: BestWeightRecord | null;
    repetitionRecord: RepetitionRecord | null;
    estimated1RM: Estimated1RMRecord | null;
  };
  comparison: null | {
    period: { from: CivilDate; to: CivilDate };
    previous: PeriodMetrics;
    delta: PeriodMetrics;
  };
  points: ExerciseProgressPoint[];
  history: {
    items: ExerciseHistorySession[];
    page: number | null;
    limit: number;
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface ProgressOverviewResponse {
  period: {
    key: ProgressPeriod;
    from: CivilDate | null;
    to: CivilDate;
    timezone: 'America/Bogota';
  };
  summary: OverviewMetrics;
  comparison: { previous: OverviewMetrics; delta: OverviewMetrics } | null;
  records: Array<{
    exerciseId: string;
    exerciseName: string;
    kind: 'WEIGHT' | 'REPS' | 'ESTIMATED_1RM';
    value: number;
    achievedAt: string;
  }>;
  muscleDistribution: Array<{
    muscleGroup: MuscleGroup;
    workingSets: number;
    percentage: number;
  }>;
}

export interface ProgressActivityResponse {
  from: CivilDate;
  to: CivilDate;
  days: Array<{
    date: CivilDate;
    sessions: Array<{ id: string; name: string; endedAt: string; volumeKg: number }>;
  }>;
}
