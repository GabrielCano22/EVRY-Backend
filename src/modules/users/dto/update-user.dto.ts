import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Sex, Goal } from '@prisma/client';
import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'UserUpdateInput' })
export class UpdateUserDto {
  @ApiPropertyOptional({ type: String, minLength: 2, maxLength: 100, description: 'Leading and trailing whitespace is removed before validation.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;
  @ApiPropertyOptional({ enum: Sex })
  @IsOptional() @IsEnum(Sex) biologicalSex?: Sex;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO 8601 date or date-time. Omitted or null values leave the current birth date unchanged.' })
  @IsOptional() @IsDateString() birthDate?: string;
  @ApiPropertyOptional({ enum: Goal, isArray: true, maxItems: 6, uniqueItems: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsEnum(Goal, { each: true })
  goals?: Goal[];
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional() @IsBoolean() trackCycle?: boolean;
  @ApiPropertyOptional({ type: 'integer', minimum: 20, maximum: 45 })
  @IsOptional() @IsInt() @Min(20) @Max(45) avgCycleLen?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 2, maximum: 10 })
  @IsOptional() @IsInt() @Min(2) @Max(10) avgPeriodLen?: number;
}
