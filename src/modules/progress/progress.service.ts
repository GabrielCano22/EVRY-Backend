import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findVisibleExerciseOrThrow } from '../exercises/exercise-visibility';
import { PrismaService } from '../../prisma/prisma.service';
import type { ActivityQueryDto } from './dto/activity-query.dto';
import type { ExerciseProgressQueryDto } from './dto/exercise-progress-query.dto';
import type { OverviewQueryDto } from './dto/overview-query.dto';
import { deltaOverviewMetrics, deltaPeriodMetrics } from './metrics';
import { resolveActivityWindow, resolveProgressPeriod } from './progress-period';
import { decodeHistoryCursor } from './history-cursor';
import {
  ProgressRepository,
  type ActivityRepositoryRow,
} from './progress.repository';
import type {
  ExerciseProgressResponse,
  ProgressActivityResponse,
  ProgressOverviewResponse,
} from './progress.types';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ProgressRepository,
  ) {}

  async exerciseProgress(
    userId: string,
    exerciseId: string,
    query: ExerciseProgressQueryDto,
  ): Promise<ExerciseProgressResponse> {
    if (query.cursor && query.page !== 1) {
      throw new BadRequestException('Usa cursor o page, no ambos métodos de paginación.');
    }
    const cursor = query.cursor
      ? decodeHistoryCursor(query.cursor, { exerciseId, period: query.period })
      : undefined;
    const period = resolveProgressPeriod(query.period);
    return this.prisma.$transaction(async (tx) => {
      await findVisibleExerciseOrThrow(tx, userId, exerciseId);
      const result = await this.repository.getExerciseProgress(tx, {
        userId,
        exerciseId,
        period,
        page: query.page,
        limit: query.limit,
        cursor,
      });
      const comparison = period.previous && result.previous
        ? {
          period: { from: period.previous.from, to: period.previous.to },
          previous: result.previous,
          delta: deltaPeriodMetrics(result.current.metrics, result.previous),
        }
        : null;

      return {
        exerciseId,
        period: {
          key: period.key,
          from: period.from,
          to: period.to,
          timezone: period.timezone,
        },
        summary: {
          sessionsCount: result.current.metrics.sessionsCount,
          workingSetsCount: result.current.metrics.workingSetsCount,
          volumeKg: result.current.metrics.volumeKg,
          bestWeight: result.current.bestWeight,
          repetitionRecord: result.current.repetitionRecord,
          estimated1RM: result.current.estimated1RM,
        },
        comparison,
        points: result.points,
        history: {
          items: result.history.items,
          page: query.cursor ? null : query.page,
          limit: query.limit,
          total: result.history.total,
          hasMore: result.history.hasMore,
          nextCursor: result.history.nextCursor,
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async overview(
    userId: string,
    query: OverviewQueryDto,
  ): Promise<ProgressOverviewResponse> {
    const period = resolveProgressPeriod(query.period);
    return this.prisma.$transaction(async (tx) => {
      const result = await this.repository.getOverview(tx, userId, period);
      return {
        period: {
          key: period.key,
          from: period.from,
          to: period.to,
          timezone: period.timezone,
        },
        summary: result.current,
        comparison: result.previous ? {
          previous: result.previous,
          delta: deltaOverviewMetrics(result.current, result.previous),
        } : null,
        records: result.records,
        muscleDistribution: result.muscleDistribution,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async activity(
    userId: string,
    query: ActivityQueryDto,
  ): Promise<ProgressActivityResponse> {
    let window;
    try {
      window = resolveActivityWindow(query.from, query.to);
    } catch (error) {
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = await this.repository.getActivity(tx, userId, window);
      return {
        from: window.from,
        to: window.to,
        days: this.groupActivityRows(rows),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private groupActivityRows(rows: readonly ActivityRepositoryRow[]): ProgressActivityResponse['days'] {
    const days = new Map<ActivityRepositoryRow['date'], ProgressActivityResponse['days'][number]>();
    for (const row of rows) {
      const day = days.get(row.date) ?? { date: row.date, sessions: [] };
      day.sessions.push({
        id: row.id,
        name: row.name,
        endedAt: row.endedAt.toISOString(),
        volumeKg: row.volumeKg,
      });
      days.set(row.date, day);
    }
    return [...days.values()];
  }
}
