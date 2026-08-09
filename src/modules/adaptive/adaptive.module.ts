import { Module } from '@nestjs/common';
import { AdaptiveService } from './adaptive.service';
import { AdaptiveController } from './adaptive.controller';
import { CycleModule } from '../cycle/cycle.module';

@Module({
  imports: [CycleModule],
  providers: [AdaptiveService],
  controllers: [AdaptiveController],
})
export class AdaptiveModule {}
