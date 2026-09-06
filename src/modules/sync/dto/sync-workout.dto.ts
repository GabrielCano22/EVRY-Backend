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
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'SyncWorkoutSetInput' })
export class SyncWorkoutSetDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4') clientId!: string;
  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt() @Min(0) baseRevision!: number;
  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  @IsString() @MinLength(1) @MaxLength(64) exerciseId!: string;
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 500 })
  @IsInt() @Min(0) @Max(500) order!: number;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 2000, nullable: true })
  @IsOptional() @IsNumber() @Min(0) @Max(2000) weightKg?: number | null;
  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 1000, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(1000) reps?: number | null;
  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 86400, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(86400) durationS?: number | null;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 10, nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number | null;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional() @IsBoolean() isWarmup?: boolean;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional() @IsBoolean() techniqueStable?: boolean | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional() @IsDateString() completedAt?: string;
}

@ApiSchema({ name: 'SyncWorkoutInput' })
export class SyncWorkoutDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4') clientId!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4') syncId!: string;
  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt() @Min(0) baseRevision!: number;
  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString() startedAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional() @IsDateString() endedAt?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional() @IsDateString() cancelledAt?: string;
  @ApiProperty({ enum: WorkoutStatus })
  @IsEnum(WorkoutStatus) status!: WorkoutStatus;
  @ApiPropertyOptional({ type: String, maxLength: 2000, nullable: true })
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ type: String, maxLength: 64, nullable: true })
  @IsOptional() @IsString() @MaxLength(64) routineId?: string;

  @ApiProperty({ type: () => [SyncWorkoutSetDto], maxItems: 250 })
  @IsArray()
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => SyncWorkoutSetDto)
  sets!: SyncWorkoutSetDto[];

  @ApiProperty({ type: 'array', maxItems: 250, items: { type: 'string', format: 'uuid' } })
  @IsArray()
  @ArrayMaxSize(250)
  @IsUUID('4', { each: true })
  deletedSetClientIds!: string[];
}
