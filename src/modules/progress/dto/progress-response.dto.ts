import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { CyclePhase, MuscleGroup } from '@prisma/client';
import type { OverviewMetrics, PeriodMetrics, ProgressPeriod } from '../progress.types';

@ApiSchema({ name: 'ProgressPeriodWindow' })
export class ProgressPeriodWindowDto {
  @ApiProperty({ type: String, enum: ['30d', '90d', '6m', '1y', 'all'] }) key!: ProgressPeriod;
  @ApiProperty({ type: String, format: 'date', nullable: true }) from!: string | null;
  @ApiProperty({ type: String, format: 'date' }) to!: string;
  @ApiProperty({ type: String, enum: ['America/Bogota'] }) timezone!: 'America/Bogota';
}

@ApiSchema({ name: 'OverviewMetrics' })
export class OverviewMetricsDto implements OverviewMetrics {
  @ApiProperty({ type: 'integer', minimum: 0 }) sessionsCompleted!: number;
  @ApiProperty({ type: Number, minimum: 0 }) volumeKg!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) activeDays!: number;
  @ApiProperty({ type: Number, minimum: 0 }) weeklyFrequency!: number;
}

/** Deltas are signed even though the underlying absolute metrics are not. */
@ApiSchema({ name: 'OverviewMetricDelta' })
export class OverviewMetricDeltaDto implements OverviewMetrics {
  @ApiProperty({ type: 'integer' }) sessionsCompleted!: number;
  @ApiProperty({ type: Number }) volumeKg!: number;
  @ApiProperty({ type: 'integer' }) activeDays!: number;
  @ApiProperty({ type: Number }) weeklyFrequency!: number;
}

@ApiSchema({ name: 'OverviewComparison' })
export class OverviewComparisonDto {
  @ApiProperty({ type: () => OverviewMetricsDto }) previous!: OverviewMetricsDto;
  @ApiProperty({ type: () => OverviewMetricDeltaDto }) delta!: OverviewMetricDeltaDto;
}

@ApiSchema({ name: 'ProgressRecord' })
export class ProgressRecordDto {
  @ApiProperty({ type: String }) exerciseId!: string;
  @ApiProperty({ type: String }) exerciseName!: string;
  @ApiProperty({ type: String, enum: ['WEIGHT', 'REPS', 'ESTIMATED_1RM'] }) kind!: 'WEIGHT' | 'REPS' | 'ESTIMATED_1RM';
  @ApiProperty({ type: Number }) value!: number;
  @ApiProperty({ type: String, format: 'date-time' }) achievedAt!: string;
}

@ApiSchema({ name: 'MuscleDistribution' })
export class MuscleDistributionDto {
  @ApiProperty({ enum: MuscleGroup }) muscleGroup!: MuscleGroup;
  @ApiProperty({ type: 'integer', minimum: 0 }) workingSets!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 100 }) percentage!: number;
}

@ApiSchema({ name: 'RecentWorkoutSummary' })
export class RecentWorkoutSummaryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) endedAt!: string;
  @ApiProperty({ type: 'integer', minimum: 0 }) setCount!: number;
  @ApiProperty({ type: Number, minimum: 0 }) volumeKg!: number;
}

@ApiSchema({ name: 'ProgressOverview' })
export class ProgressOverviewDto {
  @ApiProperty({ type: () => ProgressPeriodWindowDto }) period!: ProgressPeriodWindowDto;
  @ApiProperty({ type: () => OverviewMetricsDto }) summary!: OverviewMetricsDto;
  @ApiProperty({ type: () => OverviewComparisonDto, nullable: true }) comparison!: OverviewComparisonDto | null;
  @ApiProperty({ type: () => [ProgressRecordDto] }) records!: ProgressRecordDto[];
  @ApiProperty({ type: () => [MuscleDistributionDto] }) muscleDistribution!: MuscleDistributionDto[];
  @ApiProperty({ type: 'integer', minimum: 0 }) streakDays!: number;
  @ApiProperty({ type: () => [RecentWorkoutSummaryDto], maxItems: 5 }) recentWorkouts!: RecentWorkoutSummaryDto[];
}

@ApiSchema({ name: 'BestWeightRecord' })
export class BestWeightRecordDto {
  @ApiProperty({ type: Number }) weightKg!: number;
  @ApiProperty({ type: String, format: 'date-time' }) achievedAt!: string;
  @ApiProperty({ type: String }) workoutId!: string;
}

@ApiSchema({ name: 'RepetitionRecord' })
export class RepetitionRecordDto {
  @ApiProperty({ type: 'integer' }) reps!: number;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) achievedAt!: string;
  @ApiProperty({ type: String }) workoutId!: string;
}

@ApiSchema({ name: 'Estimated1RMRecord' })
export class Estimated1RMRecordDto {
  @ApiProperty({ type: Number }) valueKg!: number;
  @ApiProperty({ type: Number }) weightKg!: number;
  @ApiProperty({ type: 'integer' }) reps!: number;
  @ApiProperty({ type: String, format: 'date-time' }) achievedAt!: string;
  @ApiProperty({ type: String }) workoutId!: string;
  @ApiProperty({ type: String, enum: ['EPLEY'] }) formula!: 'EPLEY';
}

@ApiSchema({ name: 'ExerciseProgressSummary' })
export class ExerciseProgressSummaryDto {
  @ApiProperty({ type: 'integer', minimum: 0 }) sessionsCount!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) workingSetsCount!: number;
  @ApiProperty({ type: Number, minimum: 0 }) volumeKg!: number;
  @ApiProperty({ type: () => BestWeightRecordDto, nullable: true }) bestWeight!: BestWeightRecordDto | null;
  @ApiProperty({ type: () => RepetitionRecordDto, nullable: true }) repetitionRecord!: RepetitionRecordDto | null;
  @ApiProperty({ type: () => Estimated1RMRecordDto, nullable: true }) estimated1RM!: Estimated1RMRecordDto | null;
}

@ApiSchema({ name: 'ExercisePeriodMetrics' })
export class ExercisePeriodMetricsDto implements PeriodMetrics {
  @ApiProperty({ type: 'integer', minimum: 0 }) sessionsCount!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) workingSetsCount!: number;
  @ApiProperty({ type: Number, minimum: 0 }) volumeKg!: number;
  @ApiProperty({ type: Number, nullable: true }) bestWeightKg!: number | null;
  @ApiProperty({ type: Number, nullable: true }) estimated1RMKg!: number | null;
}

@ApiSchema({ name: 'ExercisePeriodMetricDelta' })
export class ExercisePeriodMetricDeltaDto implements PeriodMetrics {
  @ApiProperty({ type: 'integer' }) sessionsCount!: number;
  @ApiProperty({ type: 'integer' }) workingSetsCount!: number;
  @ApiProperty({ type: Number }) volumeKg!: number;
  @ApiProperty({ type: Number, nullable: true }) bestWeightKg!: number | null;
  @ApiProperty({ type: Number, nullable: true }) estimated1RMKg!: number | null;
}

@ApiSchema({ name: 'ComparisonPeriodWindow' })
export class ComparisonPeriodWindowDto {
  @ApiProperty({ type: String, format: 'date' }) from!: string;
  @ApiProperty({ type: String, format: 'date' }) to!: string;
}

@ApiSchema({ name: 'ExerciseProgressComparison' })
export class ExerciseProgressComparisonDto {
  @ApiProperty({ type: () => ComparisonPeriodWindowDto }) period!: ComparisonPeriodWindowDto;
  @ApiProperty({ type: () => ExercisePeriodMetricsDto }) previous!: ExercisePeriodMetricsDto;
  @ApiProperty({ type: () => ExercisePeriodMetricDeltaDto }) delta!: ExercisePeriodMetricDeltaDto;
}

@ApiSchema({ name: 'ExerciseProgressPoint' })
export class ExerciseProgressPointDto {
  @ApiProperty({ type: String }) workoutId!: string;
  @ApiProperty({ type: String }) workoutName!: string;
  @ApiProperty({ type: String, format: 'date-time' }) completedAt!: string;
  @ApiProperty({ type: Number, nullable: true }) maxWeightKg!: number | null;
  @ApiProperty({ type: Number, nullable: true }) estimated1RMKg!: number | null;
  @ApiProperty({ type: Number }) volumeKg!: number;
}

@ApiSchema({ name: 'ExerciseHistorySet' })
export class ExerciseHistorySetDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: 'integer' }) order!: number;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) reps!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) durationS!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) rpe!: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) completedAt!: string;
}

@ApiSchema({ name: 'ExerciseHistorySession' })
export class ExerciseHistorySessionDto {
  @ApiProperty({ type: String }) workoutId!: string;
  @ApiProperty({ type: String }) workoutName!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) endedAt!: string;
  @ApiProperty({ type: () => [ExerciseHistorySetDto] }) sets!: ExerciseHistorySetDto[];
}

@ApiSchema({ name: 'ExerciseProgressHistory' })
export class ExerciseProgressHistoryDto {
  @ApiProperty({ type: () => [ExerciseHistorySessionDto] }) items!: ExerciseHistorySessionDto[];
  @ApiProperty({ type: 'integer', minimum: 1, nullable: true }) page!: number | null;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 25 }) limit!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) total!: number;
  @ApiProperty({ type: Boolean }) hasMore!: boolean;
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

@ApiSchema({ name: 'ExerciseProgress' })
export class ExerciseProgressDto {
  @ApiProperty({ type: String }) exerciseId!: string;
  @ApiProperty({ type: () => ProgressPeriodWindowDto }) period!: ProgressPeriodWindowDto;
  @ApiProperty({ type: () => ExerciseProgressSummaryDto }) summary!: ExerciseProgressSummaryDto;
  @ApiProperty({ type: () => ExerciseProgressComparisonDto, nullable: true }) comparison!: ExerciseProgressComparisonDto | null;
  @ApiProperty({ type: () => [ExerciseProgressPointDto] }) points!: ExerciseProgressPointDto[];
  @ApiProperty({ type: () => ExerciseProgressHistoryDto }) history!: ExerciseProgressHistoryDto;
}

@ApiSchema({ name: 'ProgressActivitySession' })
export class ProgressActivitySessionDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, format: 'date-time' }) endedAt!: string;
  @ApiProperty({ type: Number }) volumeKg!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) setCount!: number;
  @ApiProperty({ enum: CyclePhase, nullable: true }) cyclePhase!: CyclePhase | null;
}

@ApiSchema({ name: 'ProgressActivityDay' })
export class ProgressActivityDayDto {
  @ApiProperty({ type: String, format: 'date' }) date!: string;
  @ApiProperty({ type: () => [ProgressActivitySessionDto] }) sessions!: ProgressActivitySessionDto[];
}

@ApiSchema({ name: 'ProgressActivity' })
export class ProgressActivityDto {
  @ApiProperty({ type: String, format: 'date' }) from!: string;
  @ApiProperty({ type: String, format: 'date' }) to!: string;
  @ApiProperty({ type: () => [ProgressActivityDayDto] }) days!: ProgressActivityDayDto[];
}
