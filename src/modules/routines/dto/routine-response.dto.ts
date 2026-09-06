import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { ExerciseEntityDto, nullableJsonSchema } from '../../exercises/dto/exercise-page.dto';

@ApiSchema({ name: 'RoutineEntity' })
export class RoutineEntityDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) userId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: 'integer', nullable: true, minimum: 0, maximum: 6 }) dayOfWeek!: number | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

@ApiSchema({ name: 'RoutineExercise' })
export class RoutineExerciseResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) routineId!: string;
  @ApiProperty({ type: String }) exerciseId!: string;
  @ApiProperty({ type: 'integer' }) order!: number;
  @ApiProperty({ type: 'integer' }) targetSets!: number;
  @ApiProperty({ type: 'integer', nullable: true }) targetReps!: number | null;
  @ApiProperty({ type: Number, nullable: true }) targetWeightKg!: number | null;
  @ApiProperty({ ...nullableJsonSchema, description: 'JSON de objetivos por serie conservado del catálogo de rutinas; puede ser null en rutinas anteriores.' }) seriesPlan!: Prisma.JsonValue;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: ExerciseEntityDto }) exercise!: ExerciseEntityDto;
}

@ApiSchema({ name: 'Routine' })
export class RoutineDto extends RoutineEntityDto {
  @ApiProperty({ type: [RoutineExerciseResponseDto] }) exercises!: RoutineExerciseResponseDto[];
}
