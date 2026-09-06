import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Flow } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'CycleEntryInput' })
export class UpsertCycleEntryDto {
  @ApiProperty({ type: String, format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  /** Fecha original cuando se edita un registro y se mueve de día. */
  @ApiPropertyOptional({ type: String, format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Fecha original cuando se mueve un registro a otro día.' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) previousDate?: string;
  @ApiPropertyOptional({ enum: Flow })
  @IsOptional() @IsEnum(Flow) flow?: Flow;
  @ApiPropertyOptional({ type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } })
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(80, { each: true }) symptoms?: string[];
  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5) energy?: number;
  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5) mood?: number;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional() @IsBoolean() isPeriodStart?: boolean;
}
