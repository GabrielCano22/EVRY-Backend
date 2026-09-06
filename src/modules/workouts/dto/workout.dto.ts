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
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'CreateWorkoutInput' })
export class CreateWorkoutDto {
  @ApiProperty({ type: String, minLength: 1 })
  @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined) @IsString() notes?: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined) @IsString() routineId?: string;
}

@ApiSchema({ name: 'UpdateWorkoutInput' })
export class UpdateWorkoutDto {
  @ApiPropertyOptional({ type: String, minLength: 1 })
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) name?: string;
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined) @IsString() notes?: string;
}

@ApiSchema({ name: 'FinishWorkoutInput' })
export class FinishWorkoutDto {
  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object, value) => value !== undefined) @IsString() notes?: string;
}

@ApiSchema({ name: 'CreateSetInput' })
export class CreateSetDto {
  @ApiProperty({ type: String })
  @IsString() exerciseId!: string;
  @ApiProperty({ type: 'integer', minimum: 0 })
  @IsInt() @Min(0) order!: number;
  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @ValidateIf((_object, value) => value !== undefined) @IsNumber() @Min(0) weightKg?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) reps?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) durationS?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 10 })
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(1) @Max(10) rpe?: number;
  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isWarmup?: boolean;
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('4') clientMutationId!: string;
  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() techniqueStable?: boolean;
}

@ApiSchema({ name: 'UpdateSetInput' })
export class UpdateSetDto {
  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional() @IsNumber() @Min(0) weightKg?: number | null;
  @ApiPropertyOptional({ type: 'integer', minimum: 0, nullable: true })
  @IsOptional() @IsInt() @Min(0) reps?: number | null;
  @ApiPropertyOptional({ type: 'integer', minimum: 0, nullable: true })
  @IsOptional() @IsInt() @Min(0) durationS?: number | null;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 10, nullable: true })
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional() @IsBoolean() techniqueStable?: boolean | null;
  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isWarmup?: boolean;
}
