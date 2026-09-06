import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { ProgressPeriod } from '../progress.types';
import { ApiPropertyOptional } from '@nestjs/swagger';

const PROGRESS_PERIODS: readonly ProgressPeriod[] = ['30d', '90d', '6m', '1y', 'all'];

export class ExerciseProgressQueryDto {
  @ApiPropertyOptional({ type: String, enum: PROGRESS_PERIODS, default: '30d' })
  @IsIn(PROGRESS_PERIODS)
  period: ProgressPeriod = '30d';

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 512, description: 'Cursor opaco; no combinar con page distinto de 1.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 25, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 10;
}
