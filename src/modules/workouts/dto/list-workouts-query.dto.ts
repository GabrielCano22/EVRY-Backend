import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListWorkoutsQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take = 20;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 10000, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  skip = 0;
}
