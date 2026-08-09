import { IsOptional, IsString, IsEnum, IsArray, IsBoolean, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Sex, Goal } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(Sex) biologicalSex?: Sex;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsArray() @IsEnum(Goal, { each: true }) goals?: Goal[];
  @IsOptional() @IsBoolean() trackCycle?: boolean;
  @IsOptional() @IsInt() @Min(20) @Max(45) avgCycleLen?: number;
  @IsOptional() @IsInt() @Min(2) @Max(10) avgPeriodLen?: number;
}
