import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Equipment, MuscleGroup } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListExercisesDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 10000, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page: number = 1;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 30, default: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit: number = 30;

  @IsOptional()
  @IsEnum(MuscleGroup)
  muscleGroup?: MuscleGroup;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tag?: string;

  @IsOptional()
  @IsEnum(Equipment)
  equipment?: Equipment;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  target?: string;
}
