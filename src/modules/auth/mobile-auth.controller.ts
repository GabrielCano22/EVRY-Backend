import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';

@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @RateLimit(5)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto, 'MOBILE');
  }

  @Post('refresh')
  @HttpCode(200)
  @RateLimit(10)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken, 'MOBILE');
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
