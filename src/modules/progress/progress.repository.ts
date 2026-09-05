import { Injectable } from '@nestjs/common';
import { CyclePhase, MuscleGroup, Prisma } from '@prisma/client';
import { APP_TIME_ZONE, type CivilDate } from '../../common/dates/civil-date';
import { roundMetric } from './metrics';
import { encodeHistoryCursor, type HistoryPosition } from './history-cursor';
import type {
  ActivityWindow,
  BestWeightRecord,
  Estimated1RMRecord,
  ExerciseHistorySession,
  ExerciseProgressPoint,
  ExerciseMetricSnapshot,
  OverviewMetrics,
  PeriodMetrics,
  ProgressPeriodWindow,
  RepetitionRecord,
} from './progress.types';

export type ProgressReader = Pick<Prisma.TransactionClient, '$queryRaw'>;

export interface ExerciseProgressRepositoryInput {
  userId: string;
  exerciseId: string;
  period: ProgressPeriodWindow;
  page: number;
  limit: number;
  cursor?: HistoryPosition;
}

export interface ExerciseProgressRepositoryResult {
  current: ExerciseMetricSnapshot;
  previous: PeriodMetrics | null;
  points: ExerciseProgressPoint[];
  history: { items: ExerciseHistorySession[]; total: number; hasMore: boolean; nextCursor: string | null };
}

export interface OverviewRepositoryResult {
  current: OverviewMetrics;
  previous: OverviewMetrics | null;
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

export interface ActivityRepositoryRow {
  date: CivilDate;
  id: string;
  name: string;
  endedAt: Date;
  volumeKg: number;
  setCount: number;
  cyclePhase: CyclePhase | null;
}

type MetricRow = {
  sessionsCount: bigint;
  workingSetsCount: bigint;
  volumeKg: number;
  bestWeightKg: number | null;
  estimated1RMKg: number | null;
};

type RecordRow = {
  kind: 'WEIGHT' | 'REPS' | 'ESTIMATED_1RM';
  workoutId: string;
  completedAt: Date;
  weightKg: number | null;
  reps: number | null;
  value: number;
};

type PointRow = {
  workoutId: string;
  workoutName: string;
  completedAt: Date;
  maxWeightKg: number | null;
  estimated1RMKg: number | null;
  volumeKg: number;
};

type CountRow = { total: bigint };

type HistoryWorkoutRow = {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  endedAt: Date;
};

type HistorySetRow = {
  workoutId: string;
  id: string;
  order: number;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  rpe: number | null;
  completedAt: Date;
};

type OverviewMetricRow = {
  sessionsCompleted: bigint;
  volumeKg: number;
  activeDays: bigint;
  firstCompletedAt: Date | null;
};

type OverviewRecordRow = {
  exerciseId: string;
  exerciseName: string;
  kind: 'WEIGHT' | 'REPS' | 'ESTIMATED_1RM';
  value: number;
  achievedAt: Date;
};

type MuscleDistributionRow = { muscleGroup: MuscleGroup; workingSets: bigint };

type ActivityRow = {
  date: string;
  id: string;
  name: string;
  endedAt: Date;
  volumeKg: number;
  setCount: bigint;
  cyclePhase: CyclePhase | null;
};

function rangeSql(fromInclusive: Date | null, toExclusive: Date): Prisma.Sql {
  return fromInclusive
    ? Prisma.sql`AND w."endedAt" >= ${fromInclusive} AND w."endedAt" < ${toExclusive}`
    : Prisma.sql`AND w."endedAt" < ${toExclusive}`;
}

function eligibleSetCte(
  userId: string,
  exerciseId: string,
  fromInclusive: Date | null,
  toExclusive: Date,
): Prisma.Sql {
  return Prisma.sql`
    WITH filtered_workout AS MATERIALIZED (
      SELECT w."id"
      FROM "Workout" w
      WHERE w."userId" = ${userId}
        AND w."endedAt" IS NOT NULL
        AND w."cancelledAt" IS NULL
        ${rangeSql(fromInclusive, toExclusive)}
    ), eligible_set AS (
      SELECT
        ws."id" AS "setId",
        ws."workoutId" AS "workoutId",
        ws."weightKg" AS "weightKg",
        ws."reps" AS "reps",
        ws."durationS" AS "durationS",
        ws."completedAt" AS "completedAt"
      FROM "WorkoutSet" ws
      JOIN filtered_workout w ON w."id" = ws."workoutId"
      WHERE ws."exerciseId" = ${exerciseId}
        AND ws."isWarmup" = FALSE
        AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
    )`;
}

function serializeMetricRow(row: MetricRow | undefined): PeriodMetrics {
  if (!row) {
    return {
      sessionsCount: 0,
      workingSetsCount: 0,
      volumeKg: 0,
      bestWeightKg: null,
      estimated1RMKg: null,
    };
  }
  return {
    sessionsCount: Number(row.sessionsCount),
    workingSetsCount: Number(row.workingSetsCount),
    volumeKg: roundMetric(Number(row.volumeKg)),
    bestWeightKg: row.bestWeightKg === null ? null : roundMetric(row.bestWeightKg),
    estimated1RMKg: row.estimated1RMKg === null ? null : roundMetric(row.estimated1RMKg),
  };
}

@Injectable()
export class ProgressRepository {
  private async metricSnapshot(
    tx: ProgressReader,
    userId: string,
    exerciseId: string,
    fromInclusive: Date | null,
    toExclusive: Date,
  ): Promise<ExerciseMetricSnapshot> {
    const [metricRow] = await tx.$queryRaw<MetricRow[]>(Prisma.sql`
      ${eligibleSetCte(userId, exerciseId, fromInclusive, toExclusive)}
      SELECT
        COUNT(DISTINCT "workoutId") AS "sessionsCount",
        COUNT(*) AS "workingSetsCount",
        COALESCE(SUM(
          CASE WHEN "weightKg" > 0 AND "reps" > 0 THEN "weightKg" * "reps" ELSE 0 END
        ), 0)::double precision AS "volumeKg",
        MAX(CASE WHEN "weightKg" > 0 THEN "weightKg" END)::double precision AS "bestWeightKg",
        MAX(
          CASE WHEN "weightKg" > 0 AND "reps" > 0
            THEN "weightKg" * (1 + "reps" / 30.0)
          END
        )::double precision AS "estimated1RMKg"
      FROM eligible_set
    `);
    const recordRows = await tx.$queryRaw<RecordRow[]>(Prisma.sql`
      ${eligibleSetCte(userId, exerciseId, fromInclusive, toExclusive)}
      (
        SELECT
          'WEIGHT'::text AS "kind",
          "workoutId",
          "completedAt",
          "weightKg",
          "reps",
          "weightKg"::double precision AS "value"
        FROM eligible_set
        WHERE "weightKg" > 0
        ORDER BY "weightKg" DESC, "completedAt" DESC, "setId" DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT
          'REPS'::text AS "kind",
          "workoutId",
          "completedAt",
          "weightKg",
          "reps",
          "reps"::double precision AS "value"
        FROM eligible_set
        WHERE "reps" > 0
        ORDER BY "reps" DESC, "completedAt" DESC, "setId" DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT
          'ESTIMATED_1RM'::text AS "kind",
          "workoutId",
          "completedAt",
          "weightKg",
          "reps",
          ("weightKg" * (1 + "reps" / 30.0))::double precision AS "value"
        FROM eligible_set
        WHERE "weightKg" > 0 AND "reps" > 0
        ORDER BY ("weightKg" * (1 + "reps" / 30.0)) DESC, "completedAt" DESC, "setId" DESC
        LIMIT 1
      )
    `);

    let bestWeight: BestWeightRecord | null = null;
    let repetitionRecord: RepetitionRecord | null = null;
    let estimated1RM: Estimated1RMRecord | null = null;
    for (const row of recordRows) {
      if (row.kind === 'WEIGHT') {
        bestWeight = {
          weightKg: roundMetric(row.value),
          achievedAt: row.completedAt.toISOString(),
          workoutId: row.workoutId,
        };
      } else if (row.kind === 'REPS') {
        repetitionRecord = {
          reps: row.reps as number,
          weightKg: row.weightKg === null ? null : roundMetric(row.weightKg),
          achievedAt: row.completedAt.toISOString(),
          workoutId: row.workoutId,
        };
      } else {
        estimated1RM = {
          valueKg: roundMetric(row.value),
          weightKg: row.weightKg as number,
          reps: row.reps as number,
          achievedAt: row.completedAt.toISOString(),
          workoutId: row.workoutId,
          formula: 'EPLEY',
        };
      }
    }

    return {
      metrics: serializeMetricRow(metricRow),
      bestWeight,
      repetitionRecord,
      estimated1RM,
    };
  }

  private async points(
    tx: ProgressReader,
    input: ExerciseProgressRepositoryInput,
  ): Promise<ExerciseProgressPoint[]> {
    const rows = await tx.$queryRaw<PointRow[]>(Prisma.sql`
      WITH filtered_workout AS MATERIALIZED (
        SELECT w."id", w."name", w."endedAt"
        FROM "Workout" w
        WHERE w."userId" = ${input.userId}
          AND w."endedAt" IS NOT NULL
          AND w."cancelledAt" IS NULL
          ${rangeSql(input.period.fromInclusive, input.period.toExclusive)}
      )
      SELECT
        w."id" AS "workoutId",
        w."name" AS "workoutName",
        w."endedAt" AS "completedAt",
        MAX(CASE WHEN ws."weightKg" > 0 THEN ws."weightKg" END)::double precision AS "maxWeightKg",
        MAX(
          CASE WHEN ws."weightKg" > 0 AND ws."reps" > 0
            THEN ws."weightKg" * (1 + ws."reps" / 30.0)
          END
        )::double precision AS "estimated1RMKg",
        COALESCE(SUM(
          CASE WHEN ws."weightKg" > 0 AND ws."reps" > 0 THEN ws."weightKg" * ws."reps" ELSE 0 END
        ), 0)::double precision AS "volumeKg"
      FROM filtered_workout w
      JOIN "WorkoutSet" ws ON ws."workoutId" = w."id"
      WHERE ws."exerciseId" = ${input.exerciseId}
        AND ws."isWarmup" = FALSE
        AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
      GROUP BY w."id", w."name", w."endedAt"
      ORDER BY w."endedAt" ASC, w."id" ASC
    `);
    return rows.map((row) => ({
      workoutId: row.workoutId,
      workoutName: row.workoutName,
      completedAt: row.completedAt.toISOString(),
      maxWeightKg: row.maxWeightKg === null ? null : roundMetric(row.maxWeightKg),
      estimated1RMKg: row.estimated1RMKg === null ? null : roundMetric(row.estimated1RMKg),
      volumeKg: roundMetric(row.volumeKg),
    }));
  }

  private async history(
    tx: ProgressReader,
    input: ExerciseProgressRepositoryInput,
  ): Promise<ExerciseProgressRepositoryResult['history']> {
    const [countRow] = await tx.$queryRaw<CountRow[]>(Prisma.sql`
      WITH filtered_workout AS MATERIALIZED (
        SELECT w."id"
        FROM "Workout" w
        WHERE w."userId" = ${input.userId}
          AND w."endedAt" IS NOT NULL
          AND w."cancelledAt" IS NULL
          ${rangeSql(input.period.fromInclusive, input.period.toExclusive)}
      )
      SELECT COUNT(DISTINCT w."id") AS "total"
      FROM filtered_workout w
      JOIN "WorkoutSet" ws ON ws."workoutId" = w."id"
      WHERE ws."exerciseId" = ${input.exerciseId}
        AND ws."isWarmup" = FALSE
        AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
    `);
    const total = Number(countRow?.total ?? 0n);
    const cursorPredicate = input.cursor
      ? Prisma.sql`AND (w."endedAt", w."id") < (${input.cursor.endedAt}, ${input.cursor.workoutId})`
      : Prisma.empty;
    const offset = input.cursor ? Prisma.empty : Prisma.sql`OFFSET ${(input.page - 1) * input.limit}`;
    const workouts = await tx.$queryRaw<HistoryWorkoutRow[]>(Prisma.sql`
      WITH filtered_workout AS MATERIALIZED (
        SELECT w."id", w."name", w."startedAt", w."endedAt"
        FROM "Workout" w
        WHERE w."userId" = ${input.userId}
          AND w."endedAt" IS NOT NULL
          AND w."cancelledAt" IS NULL
          ${rangeSql(input.period.fromInclusive, input.period.toExclusive)}
      )
      SELECT DISTINCT
        w."id" AS "workoutId",
        w."name" AS "workoutName",
        w."startedAt" AS "startedAt",
        w."endedAt" AS "endedAt"
      FROM filtered_workout w
      JOIN "WorkoutSet" ws ON ws."workoutId" = w."id"
      WHERE ws."exerciseId" = ${input.exerciseId}
        AND ws."isWarmup" = FALSE
        AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
        ${cursorPredicate}
      ORDER BY w."endedAt" DESC, w."id" DESC
      LIMIT ${input.limit + 1}
      ${offset}
    `);
    if (workouts.length === 0) return { items: [], total, hasMore: false, nextCursor: null };

    const hasMore = workouts.length > input.limit;
    const pageWorkouts = workouts.slice(0, input.limit);
    const last = pageWorkouts[pageWorkouts.length - 1];
    const nextCursor = hasMore ? encodeHistoryCursor({
      exerciseId: input.exerciseId, period: input.period.key,
      endedAt: last.endedAt, workoutId: last.workoutId,
    }) : null;
    const workoutIds = pageWorkouts.map(({ workoutId }) => workoutId);
    const sets = await tx.$queryRaw<HistorySetRow[]>(Prisma.sql`
      SELECT
        ws."workoutId" AS "workoutId",
        ws."id" AS "id",
        ws."order" AS "order",
        ws."weightKg" AS "weightKg",
        ws."reps" AS "reps",
        ws."durationS" AS "durationS",
        ws."rpe" AS "rpe",
        ws."completedAt" AS "completedAt"
      FROM "WorkoutSet" ws
      WHERE ws."workoutId" IN (${Prisma.join(workoutIds)})
        AND ws."exerciseId" = ${input.exerciseId}
        AND ws."isWarmup" = FALSE
        AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
      ORDER BY ws."workoutId" ASC, ws."order" ASC, ws."completedAt" ASC, ws."id" ASC
    `);
    const setsByWorkout = new Map<string, HistorySetRow[]>();
    for (const set of sets) {
      const existing = setsByWorkout.get(set.workoutId) ?? [];
      existing.push(set);
      setsByWorkout.set(set.workoutId, existing);
    }

    return {
      total,
      hasMore,
      nextCursor,
      items: pageWorkouts.map((workout) => ({
        workoutId: workout.workoutId,
        workoutName: workout.workoutName,
        startedAt: workout.startedAt.toISOString(),
        endedAt: workout.endedAt.toISOString(),
        sets: (setsByWorkout.get(workout.workoutId) ?? []).map((set) => ({
          id: set.id,
          order: set.order,
          weightKg: set.weightKg === null ? null : roundMetric(set.weightKg),
          reps: set.reps,
          durationS: set.durationS,
          rpe: set.rpe,
          completedAt: set.completedAt.toISOString(),
        })),
      })),
    };
  }

  async getExerciseProgress(
    tx: ProgressReader,
    input: ExerciseProgressRepositoryInput,
  ): Promise<ExerciseProgressRepositoryResult> {
    const current = await this.metricSnapshot(
      tx,
      input.userId,
      input.exerciseId,
      input.period.fromInclusive,
      input.period.toExclusive,
    );
    const previous = input.period.previous
      ? (await this.metricSnapshot(
        tx,
        input.userId,
        input.exerciseId,
        input.period.previous.fromInclusive,
        input.period.previous.toExclusive,
      )).metrics
      : null;
    const points = await this.points(tx, input);
    const history = await this.history(tx, input);
    return { current, previous, points, history };
  }

  private async overviewMetrics(
    tx: ProgressReader,
    userId: string,
    fromInclusive: Date,
    toExclusive: Date,
    allTime = false,
  ): Promise<OverviewMetrics> {
    const [row] = await tx.$queryRaw<OverviewMetricRow[]>(Prisma.sql`
      WITH completed_workout AS MATERIALIZED (
        SELECT w."id", w."endedAt"
        FROM "Workout" w
        WHERE w."userId" = ${userId}
          AND w."endedAt" IS NOT NULL
          AND w."cancelledAt" IS NULL
          AND w."endedAt" >= ${fromInclusive}
          AND w."endedAt" < ${toExclusive}
      ), eligible_set AS (
        SELECT ws."weightKg", ws."reps"
        FROM "WorkoutSet" ws
        JOIN completed_workout w ON w."id" = ws."workoutId"
        WHERE ws."isWarmup" = FALSE
          AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
      )
      SELECT
        (SELECT COUNT(*) FROM completed_workout) AS "sessionsCompleted",
        COALESCE((SELECT SUM(
          CASE WHEN "weightKg" > 0 AND "reps" > 0 THEN "weightKg" * "reps" ELSE 0 END
        ) FROM eligible_set), 0)::double precision AS "volumeKg",
        (SELECT COUNT(DISTINCT (
          ("endedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TIME_ZONE}
        )::date) FROM completed_workout) AS "activeDays",
        (SELECT MIN("endedAt") FROM completed_workout) AS "firstCompletedAt"
    `);
    const sessionsCompleted = Number(row?.sessionsCompleted ?? 0n);
    const effectiveFrom = allTime && row?.firstCompletedAt && row.firstCompletedAt > fromInclusive
      ? row.firstCompletedAt
      : fromInclusive;
    const periodDays = Math.max(
      1,
      Math.ceil((toExclusive.getTime() - effectiveFrom.getTime()) / 86_400_000),
    );
    return {
      sessionsCompleted,
      volumeKg: roundMetric(Number(row?.volumeKg ?? 0)),
      activeDays: Number(row?.activeDays ?? 0n),
      weeklyFrequency: roundMetric(sessionsCompleted * 7 / periodDays),
    };
  }

  async getOverview(
    tx: ProgressReader,
    userId: string,
    period: ProgressPeriodWindow,
  ): Promise<OverviewRepositoryResult> {
    const fromInclusive = period.fromInclusive ?? new Date(0);
    const current = await this.overviewMetrics(tx, userId, fromInclusive, period.toExclusive, period.key === 'all');
    const previous = period.previous
      ? await this.overviewMetrics(
        tx,
        userId,
        period.previous.fromInclusive,
        period.previous.toExclusive,
      )
      : null;
    const recordRows = await tx.$queryRaw<OverviewRecordRow[]>(Prisma.sql`
      SELECT * FROM (
        SELECT
          s."exerciseId" AS "exerciseId",
          e."name" AS "exerciseName",
          'WEIGHT'::text AS "kind",
          s."bestWeight"::double precision AS "value",
          s."bestWeightAt" AS "achievedAt"
        FROM "ExerciseStat" s
        JOIN "Exercise" e ON e."id" = s."exerciseId"
        WHERE s."userId" = ${userId}
          AND s."bestWeightAt" >= ${fromInclusive}
          AND s."bestWeightAt" < ${period.toExclusive}
        UNION ALL
        SELECT
          s."exerciseId", e."name", 'REPS'::text,
          s."bestReps"::double precision, s."bestRepsAt"
        FROM "ExerciseStat" s
        JOIN "Exercise" e ON e."id" = s."exerciseId"
        WHERE s."userId" = ${userId}
          AND s."bestRepsAt" >= ${fromInclusive}
          AND s."bestRepsAt" < ${period.toExclusive}
        UNION ALL
        SELECT
          s."exerciseId", e."name", 'ESTIMATED_1RM'::text,
          s."estimated1RM"::double precision, s."estimated1RMAt"
        FROM "ExerciseStat" s
        JOIN "Exercise" e ON e."id" = s."exerciseId"
        WHERE s."userId" = ${userId}
          AND s."estimated1RMAt" >= ${fromInclusive}
          AND s."estimated1RMAt" < ${period.toExclusive}
      ) records
      ORDER BY "achievedAt" DESC, "exerciseId" ASC, "kind" ASC
    `);
    const distributionRows = await tx.$queryRaw<MuscleDistributionRow[]>(Prisma.sql`
      WITH filtered_workout AS MATERIALIZED (
        SELECT w."id"
        FROM "Workout" w
        WHERE w."userId" = ${userId}
          AND w."endedAt" IS NOT NULL
          AND w."cancelledAt" IS NULL
          AND w."endedAt" >= ${fromInclusive}
          AND w."endedAt" < ${period.toExclusive}
      )
      SELECT e."muscleGroup" AS "muscleGroup", COUNT(*) AS "workingSets"
      FROM "WorkoutSet" ws
      JOIN filtered_workout w ON w."id" = ws."workoutId"
      JOIN "Exercise" e ON e."id" = ws."exerciseId"
      WHERE ws."isWarmup" = FALSE
        AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
      GROUP BY e."muscleGroup"
      ORDER BY COUNT(*) DESC, e."muscleGroup" ASC
    `);
    const totalWorkingSets = distributionRows.reduce(
      (sum, row) => sum + Number(row.workingSets),
      0,
    );

    return {
      current,
      previous,
      records: recordRows.map((row) => ({
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        kind: row.kind,
        value: roundMetric(row.value),
        achievedAt: row.achievedAt.toISOString(),
      })),
      muscleDistribution: distributionRows.map((row) => ({
        muscleGroup: row.muscleGroup,
        workingSets: Number(row.workingSets),
        percentage: totalWorkingSets === 0
          ? 0
          : roundMetric(Number(row.workingSets) * 100 / totalWorkingSets),
      })),
    };
  }

  async getActivity(
    tx: ProgressReader,
    userId: string,
    window: ActivityWindow,
  ): Promise<ActivityRepositoryRow[]> {
    const rows = await tx.$queryRaw<ActivityRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(
          (w."endedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TIME_ZONE},
          'YYYY-MM-DD'
        ) AS "date",
        w."id" AS "id",
        w."name" AS "name",
        w."endedAt" AS "endedAt",
        w."cyclePhase" AS "cyclePhase",
        (SELECT COUNT(*) FROM "WorkoutSet" ws_count WHERE ws_count."workoutId" = w."id") AS "setCount",
        COALESCE(SUM(
          CASE WHEN ws."weightKg" > 0 AND ws."reps" > 0 THEN ws."weightKg" * ws."reps" ELSE 0 END
        ), 0)::double precision AS "volumeKg"
      FROM "Workout" w
      LEFT JOIN "WorkoutSet" ws
        ON ws."workoutId" = w."id"
        AND ws."isWarmup" = FALSE
        AND (COALESCE(ws."reps", 0) > 0 OR COALESCE(ws."durationS", 0) > 0)
      WHERE w."userId" = ${userId}
        AND w."endedAt" IS NOT NULL
        AND w."cancelledAt" IS NULL
        AND w."endedAt" >= ${window.fromInclusive}
        AND w."endedAt" < ${window.toExclusive}
      GROUP BY w."id", w."name", w."endedAt", w."cyclePhase"
      ORDER BY "date" ASC, w."endedAt" ASC, w."id" ASC
    `);
    return rows.map((row) => ({
      date: row.date as CivilDate,
      id: row.id,
      name: row.name,
      endedAt: row.endedAt,
      volumeKg: roundMetric(row.volumeKg),
      setCount: Number(row.setCount),
      cyclePhase: row.cyclePhase,
    }));
  }
}
