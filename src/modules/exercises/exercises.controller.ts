import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { ExercisesService } from './exercises.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { ListExercisesDto } from './dto/list-exercises.dto';
import { ExerciseDetailDto, ExercisePageDto } from './dto/exercise-page.dto';
import { OkDto } from '../../openapi/ok.dto';

@Controller('exercises')
@UseGuards(JwtAuthGuard)
export class ExercisesController {
  constructor(private svc: ExercisesService) {}

  @Get()
  @ApiOkResponse({ type: ExercisePageDto, description: 'Catálogo paginado de ejercicios globales y propios.' })
  list(@CurrentUser() u: AuthUser, @Query() query: ListExercisesDto): Promise<ExercisePageDto> {
    return this.svc.list(u.id, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ExerciseDetailDto })
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.getById(u.id, id);
  }

  @Post()
  @ApiCreatedResponse({ type: ExerciseDetailDto })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateExerciseDto) {
    return this.svc.create(u.id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ type: OkDto })
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }
}
