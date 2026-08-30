import { Module } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { ProgressController } from './progress.controller';
import { ProgressRepository } from './progress.repository';

@Module({
  providers: [ProgressService, ProgressRepository],
  controllers: [ProgressController],
})
export class ProgressModule {}
