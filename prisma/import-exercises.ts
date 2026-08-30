import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/prisma/prisma-client';
import { DatasetExercise, toExerciseCreateInput } from '../src/modules/exercises/exercise-catalog';

export function loadSourceExercises(): DatasetExercise[] {
  const dataPath = resolve(__dirname, 'seed-data', 'exercises.json');
  const parsed = JSON.parse(readFileSync(dataPath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('The exercise dataset must be a JSON array');
  return parsed as DatasetExercise[];
}

export async function importSourceExercises(client: PrismaClient, records = loadSourceExercises()) {
  const sourceIds = records.map((record) => record.id);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error('The exercise dataset contains duplicate source IDs');

  const existing = await client.exercise.findMany({
    where: { sourceId: { in: sourceIds } },
    select: { sourceId: true },
  });
  const existingIds = new Set(existing.map((exercise) => exercise.sourceId).filter((id): id is string => Boolean(id)));

  await client.$transaction(
    records.map((record) => {
      const data = toExerciseCreateInput(record);
      return client.exercise.upsert({
        where: { sourceId: record.id },
        create: data,
        update: data,
      });
    }),
  );

  return {
    total: records.length,
    inserted: records.filter((record) => !existingIds.has(record.id)).length,
    updated: records.filter((record) => existingIds.has(record.id)).length,
  };
}

if (require.main === module) {
  const prisma = createPrismaClient();
  importSourceExercises(prisma)
    .then((result) => console.log(`Imported ${result.total} exercises (${result.inserted} inserted, ${result.updated} updated).`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
