import { IsIn } from 'class-validator';

export class OverviewQueryDto {
  @IsIn(['30d'])
  period = '30d' as const;
}
