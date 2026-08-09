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

@Controller('routines')
@UseGuards(JwtAuthGuard)
export class RoutinesController {
  constructor(private svc: RoutinesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getById(u.id, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateRoutineDto) {
    return this.svc.create(u.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoutineDto) {
    return this.svc.update(u.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }

  @Post(':id/start')
  start(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.start(u.id, id);
  }
}
