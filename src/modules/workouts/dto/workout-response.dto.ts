import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { CyclePhase, WorkoutStatus } from '@prisma/client';
import { ExerciseEntityDto } from '../../exercises/dto/exercise-page.dto';
import { RoutineDto } from '../../routines/dto/routine-response.dto';

/** Scalar Prisma workout fields; relation shapes vary by endpoint. */
@ApiSchema({ name: 'WorkoutEntity' })
export class WorkoutEntityDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) userId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) endedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) cancelledAt!: string | null;
  @ApiProperty({ enum: WorkoutStatus }) status!: WorkoutStatus;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) clientId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) lastSyncId!: string | null;
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ enum: CyclePhase, nullable: true }) cyclePhase!: CyclePhase | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, nullable: true }) routineId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

@ApiSchema({ name: 'WorkoutSet' })
export class WorkoutSetDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) workoutId!: string;
  @ApiProperty({ type: String }) exerciseId!: string;
  @ApiProperty({ type: 'integer' }) order!: number;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) reps!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) durationS!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) rpe!: number | null;
  @ApiProperty({ type: Boolean }) isWarmup!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) completedAt!: string;
  @ApiProperty({ type: String, nullable: true }) clientMutationId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) clientId!: string | null;
  @ApiProperty({ type: 'integer' }) revision!: number;
  @ApiProperty({ type: Boolean, nullable: true }) techniqueStable!: boolean | null;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: () => ExerciseEntityDto }) exercise!: ExerciseEntityDto;
}

/** workoutDetailInclude used by workout CRUD/lifecycle and routine start. */
@ApiSchema({ name: 'Workout' })
export class WorkoutDto extends WorkoutEntityDto {
  @ApiProperty({ type: () => [WorkoutSetDto] }) sets!: WorkoutSetDto[];
  @ApiProperty({ type: () => RoutineDto, nullable: true }) routine!: RoutineDto | null;
}
