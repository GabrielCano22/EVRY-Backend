import { Module } from '@nestjs/common';
import { WorkoutsModule } from '../workouts/workouts.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [WorkoutsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
