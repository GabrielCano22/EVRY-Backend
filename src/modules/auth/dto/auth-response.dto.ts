import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Sex } from '@prisma/client';

@ApiSchema({ name: 'AccessToken' })
export class AccessTokenResponseDto {
  @ApiProperty({ type: String })
  accessToken!: string;
}

@ApiSchema({ name: 'MobileTokens' })
export class MobileTokensResponseDto extends AccessTokenResponseDto {
  @ApiProperty({ type: String })
  refreshToken!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Expiration of the refresh token.' })
  expiresAt!: Date;
}

@ApiSchema({ name: 'LogoutResponse' })
export class LogoutResponseDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  ok!: boolean;
}

/** The public identity selected by JwtStrategy, not a full profile. */
@ApiSchema({ name: 'AuthUser' })
export class AuthUserResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, format: 'email' })
  email!: string;

  @ApiProperty({ enum: Sex })
  biologicalSex!: Sex;

  @ApiProperty({ type: Boolean })
  trackCycle!: boolean;
}
