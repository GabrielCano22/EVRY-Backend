import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsBoolean, MaxLength } from 'class-validator';
import { Sex } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'RegisterInput' })
export class RegisterDto {
  @ApiProperty({ type: String, format: 'email', maxLength: 254, description: 'Trimmed and lowercased before registration.' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ type: String, minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 100, description: 'Leading and trailing whitespace is removed before validation.' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiPropertyOptional({ enum: Sex, nullable: true, default: 'PREFER_NOT_SAY', description: 'Omitted or null values use PREFER_NOT_SAY.' })
  @IsOptional()
  @IsEnum(Sex)
  biologicalSex?: Sex;

  @ApiPropertyOptional({ type: Boolean, nullable: true, default: false, description: 'Omitted or null values disable cycle tracking.' })
  @IsOptional()
  @IsBoolean()
  trackCycle?: boolean;
}
