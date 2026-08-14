import { Module } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { WorkoutsController } from './workouts.controller';
import { CycleModule } from '../cycle/cycle.module';
import { ServicioSesionActiva } from './servicio-sesion-activa';

@Module({
  imports: [CycleModule],
  providers: [ServicioSesionActiva, WorkoutsService],
  controllers: [WorkoutsController],
  exports: [WorkoutsService, ServicioSesionActiva],
})
export class WorkoutsModule {}
