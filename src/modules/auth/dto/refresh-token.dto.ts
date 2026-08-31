import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'RefreshInput' })
export class RefreshTokenDto {
  @ApiProperty({ type: String, minLength: 64, maxLength: 256, writeOnly: true })
  @IsString()
  @MinLength(64)
  @MaxLength(256)
  refreshToken!: string;
}
