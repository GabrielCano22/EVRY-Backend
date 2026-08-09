import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Equipment, MuscleGroup } from '@prisma/client';

export class ListExercisesDto {
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
