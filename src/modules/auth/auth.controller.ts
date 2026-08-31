import { Body, Controller, Post, Req, Res, UseGuards, HttpCode, Get } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiSecurity, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { refreshCookieOptions } from './refresh-cookie';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { AccessTokenResponseDto, AuthUserResponseDto, LogoutResponseDto } from './dto/auth-response.dto';

const REFRESH_COOKIE = 'evry_refresh';
const REFRESH_COOKIE_HEADER = {
  'Set-Cookie': {
    description: 'Sets the HttpOnly evry_refresh browser session cookie.',
    schema: { type: 'string' as const },
  },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @ApiOperation({ operationId: 'webRegister', security: [] })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AccessTokenResponseDto, headers: REFRESH_COOKIE_HEADER })
  @ApiConflictResponse({ description: 'The email is already registered.', schema: { $ref: '#/components/schemas/ApiError' } })
  @RateLimit(3)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.register(dto);
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return { accessToken: tokens.accessToken };
  }

  @Post('login')
  @ApiOperation({ operationId: 'webLogin', security: [] })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AccessTokenResponseDto, headers: REFRESH_COOKIE_HEADER })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.', schema: { $ref: '#/components/schemas/ApiError' } })
  @HttpCode(200)
  @RateLimit(5)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto);
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @ApiOperation({ operationId: 'webRefresh', description: 'Rotates the refresh token stored in the HttpOnly evry_refresh cookie.' })
  @ApiSecurity('refreshCookie')
  @ApiOkResponse({ type: AccessTokenResponseDto, headers: REFRESH_COOKIE_HEADER })
  @ApiUnauthorizedResponse({ description: 'Missing, expired or invalid browser session.', schema: { $ref: '#/components/schemas/ApiError' } })
  @HttpCode(200)
  @RateLimit(10)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const tokens = await this.auth.refresh(token);
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @ApiOperation({ operationId: 'webLogout', description: 'Revokes the cookie session when present and always clears the browser refresh cookie.' })
  @ApiSecurity({})
  @ApiSecurity('refreshCookie')
  @ApiOkResponse({
    type: LogoutResponseDto,
    headers: { 'Set-Cookie': { description: 'Clears the evry_refresh browser session cookie.', schema: { type: 'string' } } },
  })
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    return { ok: true };
  }

  @Get('me')
  @ApiOperation({ operationId: 'authenticatedUser' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.', schema: { $ref: '#/components/schemas/ApiError' } })
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expiresAt));
  }
}
