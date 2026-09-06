import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'HealthLiveness' })
export class HealthLivenessDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}

@ApiSchema({ name: 'HealthReadiness' })
export class HealthReadinessDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
  @ApiProperty({ enum: ['ready'] }) database!: 'ready';
}
