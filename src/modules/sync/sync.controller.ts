import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncWorkoutDto } from './dto/sync-workout.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('workouts')
  @ApiOperation({ summary: 'Sincroniza una sesión offline de forma idempotente' })
  workout(@CurrentUser() user: AuthUser, @Body() dto: SyncWorkoutDto) {
    return this.sync.syncWorkout(user.id, dto);
  }
}
