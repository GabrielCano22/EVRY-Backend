import { Module } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { RoutinesController } from './routines.controller';
import { CycleModule } from '../cycle/cycle.module';

@Module({
  imports: [CycleModule],
  providers: [RoutinesService],
  controllers: [RoutinesController],
})
export class RoutinesModule {}
