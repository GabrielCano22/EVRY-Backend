import { NotFoundException } from '@nestjs/common';
import { Exercise, Prisma } from '@prisma/client';

export type ExerciseReader = Pick<Prisma.TransactionClient, 'exercise'>;

export function visibleExerciseWhere(userId: string): Prisma.ExerciseWhereInput {
  return {
    OR: [
      { ownerId: null, isCustom: false },
      { ownerId: userId, isCustom: true },
    ],
  };
}

export async function assertExercisesVisible(
  db: ExerciseReader,
  userId: string,
  exerciseIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return;

  const exercises = await db.exercise.findMany({
    where: {
      AND: [visibleExerciseWhere(userId), { id: { in: ids } }],
    },
    select: { id: true },
  });

  if (exercises.length !== ids.length) throw new NotFoundException();
}

export async function findVisibleExerciseOrThrow(
  db: ExerciseReader,
  userId: string,
  id: string,
): Promise<Exercise> {
  const exercise = await db.exercise.findFirst({
    where: { AND: [visibleExerciseWhere(userId), { id }] },
  });
  if (!exercise) throw new NotFoundException();
  return exercise;
}
