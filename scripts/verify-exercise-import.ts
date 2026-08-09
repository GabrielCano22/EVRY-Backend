import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sourceExercises = await prisma.exercise.findMany({
    where: { sourceId: { not: null } },
    select: { sourceId: true, imagePath: true, gifPath: true },
  });

  const ids = sourceExercises.map((exercise) => exercise.sourceId).filter((id): id is string => Boolean(id));
  const missingMedia = sourceExercises.filter((exercise) => !exercise.imagePath || !exercise.gifPath);

  if (ids.length !== 1324) throw new Error(`Expected 1324 imported exercises, found ${ids.length}`);
  if (new Set(ids).size !== ids.length) throw new Error('Imported source IDs are not unique');
  if (missingMedia.length > 0) throw new Error(`${missingMedia.length} imported exercises have incomplete media paths`);

  console.log(`Database invariant passed: ${ids.length} source exercises with unique IDs and complete media paths.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
