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

export class UpsertCycleEntryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  /** Fecha original cuando se edita un registro y se mueve de día. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) previousDate?: string;
  @IsOptional() @IsEnum(Flow) flow?: Flow;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(80, { each: true }) symptoms?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(5) energy?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) mood?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() isPeriodStart?: boolean;
}
