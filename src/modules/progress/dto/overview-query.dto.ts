import { IsIn } from 'class-validator';
import type { ProgressPeriod } from '../progress.types';
import { ApiPropertyOptional } from '@nestjs/swagger';

const PROGRESS_PERIODS: readonly ProgressPeriod[] = ['30d', '90d', '6m', '1y', 'all'];

export class OverviewQueryDto {
  @ApiPropertyOptional({ type: String, enum: PROGRESS_PERIODS, default: '30d' })
  @IsIn(PROGRESS_PERIODS)
  period: ProgressPeriod = '30d';
}
