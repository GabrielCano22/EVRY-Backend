import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ReadinessService } from './readiness.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

class CheckinBody {
  @IsOptional() @IsNumber() @Min(0) @Max(16) sleepHrs?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) stress?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) soreness?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) motivation?: number;
}

@Controller('readiness')
@UseGuards(JwtAuthGuard)
export class ReadinessController {
  constructor(private svc: ReadinessService) {}

  @Post('checkin')
  checkin(@CurrentUser() u: AuthUser, @Body() dto: CheckinBody) {
    return this.svc.checkin(u.id, dto);
  }

  @Get('latest')
  latest(@CurrentUser() u: AuthUser) {
    return this.svc.latest(u.id);
  }
}
