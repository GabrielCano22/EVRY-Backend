import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthLivenessDto, HealthReadinessDto } from './dto/health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Confirma que el proceso está vivo' })
  @ApiResponse({ status: 200, description: 'El proceso está vivo.', type: HealthLivenessDto })
  live() {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Confirma que el proceso y PostgreSQL están disponibles' })
  @ApiResponse({ status: 200, description: 'El proceso y PostgreSQL están disponibles.', type: HealthReadinessDto })
  @ApiResponse({ status: 503, description: 'El servicio de datos no está disponible.', schema: { $ref: '#/components/schemas/ApiError' } })
  ready() {
    return this.health.ready();
  }
}
