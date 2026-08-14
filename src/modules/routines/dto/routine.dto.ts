import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RoutineSeriesPlanDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) reps?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(500) weightKg?: number | null;
}

export class RoutineExerciseDto {
  @IsString() exerciseId!: string;
  @IsInt() @Min(0) order!: number;
  @IsInt() @Min(1) @Max(20) targetSets!: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) targetReps?: number;
  @IsOptional() @IsNumber() targetWeightKg?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutineSeriesPlanDto)
  seriesPlan?: RoutineSeriesPlanDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateRoutineDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RoutineExerciseDto)
  exercises!: RoutineExerciseDto[];
}

export class UpdateRoutineDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number | null;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RoutineExerciseDto)
  exercises?: RoutineExerciseDto[];
}
