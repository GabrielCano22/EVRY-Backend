import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { Recommendation } from '../adaptive.service';

@ApiSchema({ name: 'AdaptiveRecommendation' })
export class AdaptiveRecommendationDto implements Recommendation {
  @ApiProperty({ type: String }) exerciseId!: string;
  @ApiProperty({ type: Number, nullable: true }) targetWeightKg!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) targetReps!: number | null;
  @ApiProperty({ type: [String] }) rationale!: string[];
  @ApiProperty({ type: Number, minimum: 0, maximum: 1 }) confidence!: number;
  @ApiProperty({ enum: ['PROGRESS', 'HOLD', 'DELOAD'], description: 'Acción emitida por el recomendador; HOLD también se usa cuando falta historial comparable.' }) action!: 'PROGRESS' | 'HOLD' | 'DELOAD';
}
