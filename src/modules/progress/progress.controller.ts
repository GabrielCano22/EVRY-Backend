import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ExerciseProgressQueryDto } from './dto/exercise-progress-query.dto';
import { OverviewQueryDto } from './dto/overview-query.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { ExerciseProgressDto, ProgressActivityDto, ProgressOverviewDto } from './dto/progress-response.dto';

@ApiTags('progress')
@ApiBearerAuth()
@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private svc: ProgressService) {}

  @Get('overview')
  @ApiOkResponse({ type: ProgressOverviewDto })
  overview(@CurrentUser() u: AuthUser, @Query() query: OverviewQueryDto) {
    return this.svc.overview(u.id, query);
  }

  @Get('activity')
  @ApiOkResponse({ type: ProgressActivityDto })
  activity(@CurrentUser() u: AuthUser, @Query() query: ActivityQueryDto) {
    return this.svc.activity(u.id, query);
  }

  @Get(['exercises/:id', 'exercise/:id'])
  @ApiOkResponse({ type: ExerciseProgressDto })
  @ApiNotFoundResponse({ description: 'Ejercicio no encontrado.', schema: { $ref: '#/components/schemas/ApiError' } })
  exerciseProgress(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Query() query: ExerciseProgressQueryDto,
  ) {
    return this.svc.exerciseProgress(u.id, id, query);
  }
}
