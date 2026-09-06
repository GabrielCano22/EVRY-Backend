import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

@ApiSchema({ name: 'ReadinessInput' })
export class CheckinReadinessDto {
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 16 })
  @IsOptional() @IsNumber() @Min(0) @Max(16) sleepHrs?: number;

  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5) stress?: number;

  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5) soreness?: number;

  @ApiPropertyOptional({ type: 'integer', nullable: true, minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5) motivation?: number;
}

@ApiSchema({ name: 'Readiness' })
export class ReadinessResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) userId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) date!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha civil persistida y serializada como medianoche UTC; puede ser null en registros anteriores.' }) civilDate!: string | null;
  @ApiProperty({ type: Number, nullable: true }) sleepHrs!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) stress!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) soreness!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) motivation!: number | null;
  @ApiProperty({ type: Number, minimum: 0, maximum: 100 }) score!: number;
}
