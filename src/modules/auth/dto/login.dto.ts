import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'LoginInput' })
export class LoginDto {
  @ApiProperty({ type: String, format: 'email', maxLength: 254, description: 'Trimmed and lowercased before authentication.' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ type: String, maxLength: 128, writeOnly: true })
  @IsString()
  @MaxLength(128)
  password!: string;
}
