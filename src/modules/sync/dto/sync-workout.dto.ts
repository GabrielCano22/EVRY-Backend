import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { WorkoutStatus } from '@prisma/client';

export class SyncWorkoutSetDto {
  @IsUUID('4') clientId!: string;
  @IsInt() @Min(0) baseRevision!: number;
  @IsString() @MinLength(1) @MaxLength(64) exerciseId!: string;
  @IsInt() @Min(0) @Max(500) order!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(2000) weightKg?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000) reps?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(86400) durationS?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number | null;
  @IsOptional() @IsBoolean() isWarmup?: boolean;
  @IsOptional() @IsBoolean() techniqueStable?: boolean | null;
  @IsOptional() @IsDateString() completedAt?: string;
}

export class SyncWorkoutDto {
  @IsUUID('4') clientId!: string;
  @IsUUID('4') syncId!: string;
  @IsInt() @Min(0) baseRevision!: number;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsDateString() startedAt!: string;
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsDateString() cancelledAt?: string;
  @IsEnum(WorkoutStatus) status!: WorkoutStatus;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(64) routineId?: string;

  @IsArray()
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => SyncWorkoutSetDto)
  sets!: SyncWorkoutSetDto[];

  @IsArray()
  @ArrayMaxSize(250)
  @IsUUID('4', { each: true })
  deletedSetClientIds!: string[];
}
