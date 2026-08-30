import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Confirma que el proceso está vivo' })
  live() {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Confirma que el proceso y PostgreSQL están disponibles' })
  ready() {
    return this.health.ready();
  }
}
