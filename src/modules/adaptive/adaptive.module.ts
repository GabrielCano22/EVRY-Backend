import { Module } from '@nestjs/common';
import { AdaptiveService } from './adaptive.service';
import { AdaptiveController } from './adaptive.controller';
import { CycleModule } from '../cycle/cycle.module';
import { ReadinessModule } from '../readiness/readiness.module';

@Module({
  imports: [CycleModule, ReadinessModule],
  providers: [AdaptiveService],
  controllers: [AdaptiveController],
})
export class AdaptiveModule {}
