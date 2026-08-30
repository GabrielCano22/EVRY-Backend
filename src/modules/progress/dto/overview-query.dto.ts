import { IsIn } from 'class-validator';
import type { ProgressPeriod } from '../progress.types';

const PROGRESS_PERIODS: readonly ProgressPeriod[] = ['30d', '90d', '6m', '1y', 'all'];

export class OverviewQueryDto {
  @IsIn(PROGRESS_PERIODS)
  period: ProgressPeriod = '30d';
}
