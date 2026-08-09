import { Module } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { ReadinessController } from './readiness.controller';

@Module({
  providers: [ReadinessService],
  controllers: [ReadinessController],
})
export class ReadinessModule {}
