import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateWorkoutDto {
  @IsString() @MinLength(1) name!: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() notes?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() routineId?: string;
}

export class UpdateWorkoutDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) name?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() notes?: string;
}

export class FinishWorkoutDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() notes?: string;
}

export class CreateSetDto {
  @IsString() exerciseId!: string;
  @IsInt() @Min(0) order!: number;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber() @Min(0) weightKg?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) reps?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) durationS?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) @Max(10) rpe?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isWarmup?: boolean;
  @IsUUID('4') clientMutationId!: string;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() techniqueStable?: boolean;
}

export class UpdateSetDto {
  @IsOptional() @IsNumber() @Min(0) weightKg?: number | null;
  @IsOptional() @IsInt() @Min(0) reps?: number | null;
  @IsOptional() @IsInt() @Min(0) durationS?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number | null;
  @IsOptional() @IsBoolean() techniqueStable?: boolean | null;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isWarmup?: boolean;
}
