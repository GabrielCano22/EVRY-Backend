import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WorkoutsService } from './workouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateSetDto, CreateWorkoutDto, FinishWorkoutDto, UpdateSetDto, UpdateWorkoutDto } from './dto/workout.dto';
import { WorkoutDto, WorkoutSetDto } from './dto/workout-response.dto';

@ApiTags('workouts')
@ApiBearerAuth()
@Controller('workouts')
@UseGuards(JwtAuthGuard)
export class WorkoutsController {
  constructor(private svc: WorkoutsService) {}

  @Post()
  @ApiCreatedResponse({ type: WorkoutDto })
  @ApiNotFoundResponse({ description: 'Rutina no encontrada.', schema: { $ref: '#/components/schemas/ApiError' } })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateWorkoutDto) {
    return this.svc.create(u.id, dto);
  }

  @Get()
  @ApiQuery({ name: 'take', required: false, schema: { type: 'integer', default: 20 } })
  @ApiQuery({ name: 'skip', required: false, schema: { type: 'integer', default: 0 } })
  @ApiOkResponse({ type: [WorkoutDto] })
  list(@CurrentUser() u: AuthUser, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.svc.list(u.id, take ? Number(take) : 20, skip ? Number(skip) : 0);
  }

  @Get(':id')
  @ApiOkResponse({ type: WorkoutDto })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u.id, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: WorkoutDto })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateWorkoutDto) {
    return this.svc.update(u.id, id, dto);
  }

  @Post(':id/finish')
  @ApiCreatedResponse({ type: WorkoutDto })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  finish(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: FinishWorkoutDto) {
    return this.svc.finish(u.id, id, dto);
  }

  @Post(':id/cancel')
  @ApiCreatedResponse({ type: WorkoutDto })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.cancel(u.id, id);
  }

  @Delete(':id')
  @ApiOkResponse({ schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } } })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }

  @Post(':id/sets')
  @ApiCreatedResponse({ type: WorkoutSetDto })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  addSet(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateSetDto) {
    return this.svc.addSet(u.id, id, dto);
  }

  @Patch('sets/:setId')
  @ApiOkResponse({ type: WorkoutSetDto })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  updateSet(@CurrentUser() u: AuthUser, @Param('setId') setId: string, @Body() dto: UpdateSetDto) {
    return this.svc.updateSet(u.id, setId, dto);
  }

  @Delete('sets/:setId')
  @ApiOkResponse({ schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } } })
  @ApiNotFoundResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  @ApiForbiddenResponse({ schema: { $ref: '#/components/schemas/ApiError' } })
  removeSet(@CurrentUser() u: AuthUser, @Param('setId') setId: string) {
    return this.svc.removeSet(u.id, setId);
  }
}
