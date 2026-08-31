import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateRoutineDto, UpdateRoutineDto } from './dto/routine.dto';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { RoutineDto } from './dto/routine-response.dto';
import { OkDto } from '../../openapi/ok.dto';
import { WorkoutDto } from '../workouts/dto/workout-response.dto';

@Controller('routines')
@UseGuards(JwtAuthGuard)
export class RoutinesController {
  constructor(private svc: RoutinesService) {}

  @Get()
  @ApiOkResponse({ type: [RoutineDto] })
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: RoutineDto })
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getById(u.id, id);
  }

  @Post()
  @ApiCreatedResponse({ type: RoutineDto })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateRoutineDto) {
    return this.svc.create(u.id, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: RoutineDto })
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoutineDto) {
    return this.svc.update(u.id, id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ type: OkDto })
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }

  @Post(':id/start')
  @ApiCreatedResponse({ type: WorkoutDto })
  start(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.start(u.id, id);
  }
}
