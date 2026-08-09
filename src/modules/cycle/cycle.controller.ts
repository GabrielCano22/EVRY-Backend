import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CycleService } from './cycle.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { UpsertCycleEntryDto } from './dto/cycle.dto';

@Controller('cycle')
@UseGuards(JwtAuthGuard)
export class CycleController {
  constructor(private svc: CycleService) {}

  @Post('entries')
  upsert(@CurrentUser() u: AuthUser, @Body() dto: UpsertCycleEntryDto) {
    return this.svc.upsertEntry(u.id, dto);
  }

  @Get('entries')
  list(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.list(u.id, from, to);
  }

  @Get('today')
  today(@CurrentUser() u: AuthUser) {
    return this.svc.phaseInfo(u.id);
  }
}
