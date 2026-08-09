import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Sex } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEnum(Sex)
  biologicalSex?: Sex;

  @IsOptional()
  @IsBoolean()
  trackCycle?: boolean;
}
