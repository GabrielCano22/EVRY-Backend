import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { ReadinessService } from './readiness.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CheckinReadinessDto, ReadinessResponseDto } from './dto/readiness.dto';

@ApiTags('readiness')
@ApiExtraModels(ReadinessResponseDto)
@Controller('readiness')
@UseGuards(JwtAuthGuard)
export class ReadinessController {
  constructor(private svc: ReadinessService) {}

  @Post('checkin')
  @ApiResponse({ status: 201, description: 'Estado diario creado o actualizado para la fecha civil de hoy.', type: ReadinessResponseDto })
  checkin(@CurrentUser() u: AuthUser, @Body() dto: CheckinReadinessDto) {
    return this.svc.checkin(u.id, dto);
  }

  @Get('latest')
  @ApiResponse({
    status: 200,
    description: 'Estado de la fecha civil de hoy, o null si todavía no se registró.',
    schema: { type: 'object', nullable: true, allOf: [{ $ref: getSchemaPath(ReadinessResponseDto) }] },
  })
  latest(@CurrentUser() u: AuthUser) {
    return this.svc.latest(u.id);
  }
}
