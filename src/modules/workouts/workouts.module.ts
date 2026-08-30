import { Module } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { WorkoutsController } from './workouts.controller';
import { CycleModule } from '../cycle/cycle.module';
import { ExerciseStatsService } from './exercise-stats.service';
import { ServicioSesionActiva } from './servicio-sesion-activa';

@Module({
  imports: [CycleModule],
  providers: [ServicioSesionActiva, ExerciseStatsService, WorkoutsService],
  controllers: [WorkoutsController],
  exports: [WorkoutsService, ServicioSesionActiva, ExerciseStatsService],
})
export class WorkoutsModule {}
