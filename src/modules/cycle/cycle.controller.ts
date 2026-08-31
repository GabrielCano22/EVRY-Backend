import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiParam, ApiQuery, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { CycleService } from './cycle.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { UpsertCycleEntryDto } from './dto/cycle.dto';
import { CycleEntryResponseDto, CyclePhaseInfoDto, DeleteCycleEntryResultDto } from './dto/cycle-response.dto';

@ApiTags('cycle')
@ApiExtraModels(CyclePhaseInfoDto)
@Controller('cycle')
@UseGuards(JwtAuthGuard)
export class CycleController {
  constructor(private svc: CycleService) {}

  @Post('entries')
  @ApiResponse({ status: 201, description: 'Registro del ciclo creado o actualizado.', type: CycleEntryResponseDto })
  upsert(@CurrentUser() u: AuthUser, @Body() dto: UpsertCycleEntryDto) {
    return this.svc.upsertEntry(u.id, dto);
  }

  @Get('entries')
  @ApiQuery({ name: 'from', required: false, type: String, format: 'date', description: 'Inicio inclusivo del rango de fechas civiles.' })
  @ApiQuery({ name: 'to', required: false, type: String, format: 'date', description: 'Fin inclusivo del rango de fechas civiles; no admite fechas futuras.' })
  @ApiResponse({ status: 200, description: 'Hasta 180 registros, ordenados por fecha descendente.', type: CycleEntryResponseDto, isArray: true })
  list(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.list(u.id, from, to);
  }

  @Get('today')
  @ApiResponse({
    status: 200,
    description: 'Contexto estimado del ciclo, o null si no hay seguimiento voluntario o inicios registrados.',
    schema: { type: 'object', nullable: true, allOf: [{ $ref: getSchemaPath(CyclePhaseInfoDto) }] },
  })
  today(@CurrentUser() u: AuthUser) {
    return this.svc.phaseInfo(u.id);
  }

  @Delete('entries/:id')
  @ApiParam({ name: 'id', type: String, description: 'Identificador del registro del ciclo.' })
  @ApiResponse({ status: 200, description: 'Registro eliminado.', type: DeleteCycleEntryResultDto })
  @ApiResponse({ status: 404, description: 'El registro no existe o no pertenece al usuario.', schema: { $ref: '#/components/schemas/ApiError' } })
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeEntry(u.id, id);
  }
}
