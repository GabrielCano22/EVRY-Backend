import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, Max, MinLength } from 'class-validator';

export class CreateWorkoutDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateWorkoutDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() notes?: string;
}

export class FinishWorkoutDto {
  @IsOptional() @IsString() notes?: string;
}

export class CreateSetDto {
  @IsString() exerciseId!: string;
  @IsInt() @Min(0) order!: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsInt() @Min(0) reps?: number;
  @IsOptional() @IsInt() @Min(0) durationS?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number;
  @IsOptional() @IsBoolean() isWarmup?: boolean;
}

export class UpdateSetDto {
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsInt() reps?: number;
  @IsOptional() @IsInt() durationS?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number;
  @IsOptional() @IsBoolean() isWarmup?: boolean;
}
