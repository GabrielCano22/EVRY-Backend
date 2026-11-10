import { loadSourceExercises } from '../prisma/import-exercises';
import { planReviewedNames } from '../src/modules/exercises/reviewed-name-plan';
import { createPrismaClient } from '../src/prisma/prisma-client';

/** Read-only dry run against the explicitly isolated local EVRY database. */
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.hostname !== '127.0.0.1' || url.port !== '55439') throw new Error('Solo se permite inspeccionar la base local aislada en 127.0.0.1:55439.');
  const client = createPrismaClient();
  try {
    const rows = await client.exercise.findMany({
      where: { sourceId: { not: null } },
      select: { id: true, sourceId: true, name: true, isCustom: true, ownerId: true },
    });
    const result = planReviewedNames(loadSourceExercises(), rows);
    console.log(JSON.stringify({ ...result, note: 'Solo lectura: no se modificaron datos.' }, null, 2));
  } finally { await client.$disconnect(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo generar el plan.');
  process.exitCode = 1;
});
