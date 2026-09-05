import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { CyclePhase, Flow } from '@prisma/client';
import type { CivilDate } from '../../../common/dates/civil-date';
import type { PhaseInfo } from '../cycle.service';

@ApiSchema({ name: 'CycleEntry' })
export class CycleEntryResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) userId!: string;
  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha civil persistida y serializada como medianoche UTC.' }) date!: string;
  @ApiProperty({ enum: Flow }) flow!: Flow;
  @ApiProperty({ type: [String] }) symptoms!: string[];
  @ApiProperty({ type: 'integer', nullable: true }) energy!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) mood!: number | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: Boolean }) isPeriodStart!: boolean;
}

@ApiSchema({ name: 'CycleCalendar' })
export class CycleCalendarResponseDto {
  @ApiProperty({ type: String, format: 'date' }) from!: string;
  @ApiProperty({ type: String, format: 'date' }) to!: string;
  @ApiProperty({ type: () => [CycleEntryResponseDto] }) entries!: CycleEntryResponseDto[];
  @ApiProperty({ type: String, format: 'date', nullable: true }) previousPeriodStart!: string | null;
}

@ApiSchema({ name: 'CyclePhaseInfo' })
export class CyclePhaseInfoDto implements PhaseInfo {
  @ApiProperty({ enum: CyclePhase }) phase!: CyclePhase;
  @ApiProperty({ type: 'integer' }) dayOfCycle!: number;
  @ApiProperty({ type: 'integer' }) cycleLength!: number;
  @ApiProperty({ type: String, format: 'date', nullable: true }) nextPeriodStart!: CivilDate | null;
  @ApiProperty({ type: String }) trainingHint!: string;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1 }) intensityCap!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1 }) volumeCap!: number;
}

@ApiSchema({ name: 'DeleteCycleEntryResult' })
export class DeleteCycleEntryResultDto {
  @ApiProperty({ type: Boolean, enum: [true] }) ok!: true;
}
