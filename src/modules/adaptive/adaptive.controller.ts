import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AdaptiveService } from './adaptive.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('adaptive')
@UseGuards(JwtAuthGuard)
export class AdaptiveController {
  constructor(private svc: AdaptiveService) {}

  @Get('recommend/:exerciseId')
  recommend(@CurrentUser() u: AuthUser, @Param('exerciseId') exerciseId: string) {
    return this.svc.recommend(u.id, exerciseId);
  }
}
