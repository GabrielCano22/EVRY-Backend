import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RoutineSeriesPlanDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) reps?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(500) weightKg?: number | null;
}

export class RoutineExerciseDto {
  @IsString() @MaxLength(64) exerciseId!: string;
  @IsInt() @Min(0) order!: number;
  @IsInt() @Min(1) @Max(20) targetSets!: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) targetReps?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(500) targetWeightKg?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RoutineSeriesPlanDto)
  seriesPlan?: RoutineSeriesPlanDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateRoutineDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RoutineExerciseDto)
  exercises!: RoutineExerciseDto[];
}

export class UpdateRoutineDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RoutineExerciseDto)
  exercises?: RoutineExerciseDto[];
}
