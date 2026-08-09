import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { ListExercisesDto } from './dto/list-exercises.dto';

@Controller('exercises')
@UseGuards(JwtAuthGuard)
export class ExercisesController {
  constructor(private svc: ExercisesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() query: ListExercisesDto) {
    return this.svc.list(u.id, query);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getById(u.id, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateExerciseDto) {
    return this.svc.create(u.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }
}
