import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateSetDto, CreateWorkoutDto, FinishWorkoutDto, UpdateSetDto, UpdateWorkoutDto } from './dto/workout.dto';

@Controller('workouts')
@UseGuards(JwtAuthGuard)
export class WorkoutsController {
  constructor(private svc: WorkoutsService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateWorkoutDto) {
    return this.svc.create(u.id, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.svc.list(u.id, take ? Number(take) : 20, skip ? Number(skip) : 0);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u.id, id);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateWorkoutDto) {
    return this.svc.update(u.id, id, dto);
  }

  @Post(':id/finish')
  finish(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: FinishWorkoutDto) {
    return this.svc.finish(u.id, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.cancel(u.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.id, id);
  }

  @Post(':id/sets')
  addSet(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateSetDto) {
    return this.svc.addSet(u.id, id, dto);
  }

  @Patch('sets/:setId')
  updateSet(@CurrentUser() u: AuthUser, @Param('setId') setId: string, @Body() dto: UpdateSetDto) {
    return this.svc.updateSet(u.id, setId, dto);
  }

  @Delete('sets/:setId')
  removeSet(@CurrentUser() u: AuthUser, @Param('setId') setId: string) {
    return this.svc.removeSet(u.id, setId);
  }
}
