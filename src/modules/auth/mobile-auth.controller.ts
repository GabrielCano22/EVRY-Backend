import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { LogoutResponseDto, MobileTokensResponseDto } from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @ApiOperation({ operationId: 'mobileLogin', security: [] })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: MobileTokensResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.', schema: { $ref: '#/components/schemas/ApiError' } })
  @HttpCode(200)
  @RateLimit(5)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto, 'MOBILE');
  }

  @Post('refresh')
  @ApiOperation({ operationId: 'mobileRefresh', security: [] })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: MobileTokensResponseDto })
  @ApiUnauthorizedResponse({ description: 'Expired or invalid mobile refresh token.', schema: { $ref: '#/components/schemas/ApiError' } })
  @HttpCode(200)
  @RateLimit(10)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken, 'MOBILE');
  }

  @Post('logout')
  @ApiOperation({ operationId: 'mobileLogout', security: [] })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({ description: 'A token from another platform is rejected.', schema: { $ref: '#/components/schemas/ApiError' } })
  @HttpCode(200)
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken, 'MOBILE');
  }
}
