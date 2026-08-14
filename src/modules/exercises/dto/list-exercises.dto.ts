import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Equipment, MuscleGroup } from '@prisma/client';

export class ListExercisesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 30;

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
}
