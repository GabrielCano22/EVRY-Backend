import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdaptiveService } from './adaptive.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AdaptiveRecommendationDto } from './dto/recommendation.dto';

@ApiTags('adaptive')
@Controller('adaptive')
@UseGuards(JwtAuthGuard)
export class AdaptiveController {
  constructor(private svc: AdaptiveService) {}

  @Get('recommend/:exerciseId')
  @ApiParam({ name: 'exerciseId', type: String, description: 'Identificador del ejercicio para consultar el historial comparable.' })
  @ApiResponse({ status: 200, description: 'Recomendación de carga y repeticiones basada en sesiones completadas y estado diario.', type: AdaptiveRecommendationDto })
  recommend(@CurrentUser() u: AuthUser, @Param('exerciseId') exerciseId: string) {
    return this.svc.recommend(u.id, exerciseId);
  }
}
