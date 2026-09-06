import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SyncWorkoutDto } from './dto/sync-workout.dto';
import { SyncCanonicalWorkoutDto, SyncWorkoutResultDto } from './dto/sync-workout-response.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('workouts')
  @ApiOperation({ summary: 'Sincroniza una sesión offline de forma idempotente' })
  @ApiCreatedResponse({ type: SyncWorkoutResultDto })
  @ApiNotFoundResponse({ description: 'Ejercicio o rutina no encontrados.', schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiConflictResponse({
    description: 'Conflicto de revisión o de sesión activa; incluye la versión canónica o null si no existe.',
    schema: {
      allOf: [
        { $ref: '#/components/schemas/ApiError' },
        {
          type: 'object',
          required: ['serverVersion'],
          properties: {
            serverVersion: { nullable: true, allOf: [{ $ref: getSchemaPath(SyncCanonicalWorkoutDto) }] },
          },
        },
      ],
    },
  })
  workout(@CurrentUser() user: AuthUser, @Body() dto: SyncWorkoutDto) {
    return this.sync.syncWorkout(user.id, dto);
  }
}
