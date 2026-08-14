import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Flow } from '@prisma/client';

export class UpsertCycleEntryDto {
  @IsDateString() date!: string;
  /** Fecha original cuando se edita un registro y se mueve de día. */
  @IsOptional() @IsDateString() previousDate?: string;
  @IsOptional() @IsEnum(Flow) flow?: Flow;
  @IsOptional() @IsArray() @IsString({ each: true }) symptoms?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(5) energy?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) mood?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isPeriodStart?: boolean;
}
