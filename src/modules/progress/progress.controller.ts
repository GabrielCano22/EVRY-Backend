import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private svc: ProgressService) {}

  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.svc.overview(u.id);
  }

  @Get('exercise/:id')
  history(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.exerciseHistory(u.id, id);
  }
}
