import { IsBoolean, IsEnum, IsOptional, IsString, MinLength, IsArray } from 'class-validator';
import { Equipment, MuscleGroup } from '@prisma/client';

export class CreateExerciseDto {
  @IsString() @MinLength(2) name!: string;
  @IsEnum(MuscleGroup) muscleGroup!: MuscleGroup;
  @IsOptional() @IsEnum(Equipment) equipment?: Equipment;
  @IsOptional() @IsBoolean() isCompound?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() description?: string;
}
