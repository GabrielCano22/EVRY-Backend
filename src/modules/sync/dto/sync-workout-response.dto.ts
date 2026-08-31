import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { RoutineEntityDto } from '../../routines/dto/routine-response.dto';
import { WorkoutEntityDto, WorkoutSetDto } from '../../workouts/dto/workout-response.dto';

/** Sync includes scalar routine fields, not the routine's exercise plan. */
@ApiSchema({ name: 'SyncCanonicalWorkout' })
export class SyncCanonicalWorkoutDto extends WorkoutEntityDto {
  @ApiProperty({ type: () => [WorkoutSetDto] }) sets!: WorkoutSetDto[];
  @ApiProperty({ type: () => RoutineEntityDto, nullable: true }) routine!: RoutineEntityDto | null;
}

@ApiSchema({ name: 'SyncWorkoutIdentity' })
export class SyncWorkoutIdentityDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) clientId!: string | null;
  @ApiProperty({ type: String }) serverId!: string;
}

@ApiSchema({ name: 'SyncSetIdentity' })
export class SyncSetIdentityDto {
  @ApiProperty({ type: String, format: 'uuid' }) clientId!: string;
  @ApiProperty({ type: String }) serverId!: string;
  @ApiProperty({ type: 'integer' }) revision!: number;
}

@ApiSchema({ name: 'SyncWorkoutMapping' })
export class SyncWorkoutMappingDto {
  @ApiProperty({ type: () => SyncWorkoutIdentityDto }) workout!: SyncWorkoutIdentityDto;
  @ApiProperty({ type: () => [SyncSetIdentityDto] }) sets!: SyncSetIdentityDto[];
}

@ApiSchema({ name: 'SyncWorkoutResult' })
export class SyncWorkoutResultDto {
  @ApiProperty({ type: () => SyncCanonicalWorkoutDto }) workout!: SyncCanonicalWorkoutDto;
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ type: () => SyncWorkoutMappingDto }) mapping!: SyncWorkoutMappingDto;
}
