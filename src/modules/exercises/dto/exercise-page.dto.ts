import { ApiProperty } from '@nestjs/swagger';
import { Equipment, MuscleGroup } from '@prisma/client';

/** Fields actually selected and serialized by the paginated catalog. */
export class ExerciseListItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, nullable: true }) sourceId!: string | null;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ enum: MuscleGroup }) muscleGroup!: MuscleGroup;
  @ApiProperty({ enum: Equipment }) equipment!: Equipment;
  @ApiProperty({ type: String, nullable: true }) category!: string | null;
  @ApiProperty({ type: String, nullable: true }) bodyPart!: string | null;
  @ApiProperty({ type: String, nullable: true }) target!: string | null;
  @ApiProperty({ type: [String] }) secondaryMuscles!: string[];
  @ApiProperty({ type: String, nullable: true }) equipmentLabel!: string | null;
  @ApiProperty({ type: Boolean }) isCustom!: boolean;
  @ApiProperty({ type: String, nullable: true }) ownerId!: string | null;
  @ApiProperty({ type: Boolean }) isCompound!: boolean;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) mediaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) imagePath!: string | null;
  @ApiProperty({ type: String, nullable: true }) gifPath!: string | null;
  @ApiProperty({ type: String, nullable: true }) attribution!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) gifUrl!: string | null;
}

export class ExercisePageDto {
  @ApiProperty({ type: [ExerciseListItemDto] }) items!: ExerciseListItemDto[];
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10000 }) page!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 30 }) limit!: number;
  @ApiProperty({ type: 'integer', minimum: 0 }) total!: number;
  @ApiProperty({ type: Boolean }) hasMore!: boolean;
}
