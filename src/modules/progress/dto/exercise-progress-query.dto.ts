import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { ProgressPeriod } from '../progress.types';

const PROGRESS_PERIODS: readonly ProgressPeriod[] = ['30d', '90d', '6m', '1y', 'all'];

export class ExerciseProgressQueryDto {
  @IsIn(PROGRESS_PERIODS)
  period: ProgressPeriod = '30d';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 10;
}
