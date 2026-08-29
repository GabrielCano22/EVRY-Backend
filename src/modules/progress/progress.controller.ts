import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ExerciseProgressQueryDto } from './dto/exercise-progress-query.dto';
import { OverviewQueryDto } from './dto/overview-query.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private svc: ProgressService) {}

  @Get('overview')
  overview(@CurrentUser() u: AuthUser, @Query() query: OverviewQueryDto) {
    return this.svc.overview(u.id, query);
  }

  @Get('activity')
  activity(@CurrentUser() u: AuthUser, @Query() query: ActivityQueryDto) {
    return this.svc.activity(u.id, query);
  }

  @Get('exercise/:id')
  exerciseProgress(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Query() query: ExerciseProgressQueryDto,
  ) {
    return this.svc.exerciseProgress(u.id, id, query);
  }
}
