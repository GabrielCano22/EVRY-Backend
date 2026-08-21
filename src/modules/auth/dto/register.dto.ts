import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { Sex } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsEnum(Sex)
  biologicalSex?: Sex;

  @IsOptional()
  @IsBoolean()
  trackCycle?: boolean;
}
