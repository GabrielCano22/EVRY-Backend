import { Module } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { WorkoutsController } from './workouts.controller';
import { CycleModule } from '../cycle/cycle.module';

@Module({
  imports: [CycleModule],
  providers: [WorkoutsService],
  controllers: [WorkoutsController],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}
