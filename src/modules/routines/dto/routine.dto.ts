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

export class RoutineExerciseDto {
  @IsString() exerciseId!: string;
  @IsInt() @Min(0) order!: number;
  @IsInt() @Min(1) @Max(20) targetSets!: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) targetReps?: number;
  @IsOptional() @IsNumber() targetWeightKg?: number;
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
