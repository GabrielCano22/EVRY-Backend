import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsBoolean, MaxLength, ValidateBy } from 'class-validator';
import { Sex } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'RegisterInput' })
export class RegisterDto {
  @ApiProperty({ type: String, format: 'email', maxLength: 254, description: 'Trimmed and lowercased before registration.' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ type: String, minLength: 8, maxLength: 72, writeOnly: true,
    description: 'New passwords must be valid Unicode and fit within 72 UTF-8 bytes; no truncation or normalization is applied.' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @ValidateBy({
    name: 'bcryptUtf8Password',
    validator: {
      validate(value: unknown): boolean {
        if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 72) return false;
        // Avoid encodeURI-based byte validators throwing on malformed UTF-16.
        return Buffer.from(value, 'utf8').toString('utf8') === value;
      },
      defaultMessage: () => '$property debe ser Unicode válido y no superar 72 bytes UTF-8.',
    },
  })
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
