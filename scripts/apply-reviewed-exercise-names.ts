import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Prisma } from '@prisma/client';
import { loadSourceExercises } from '../prisma/import-exercises';
import { applyReviewedNamePlan } from '../src/modules/exercises/apply-reviewed-name-plan';
import { planReviewedNames } from '../src/modules/exercises/reviewed-name-plan';
import { createPrismaClient } from '../src/prisma/prisma-client';

async function main() {
  const [mode, backupArgument, expectedDigest] = process.argv.slice(2);
  if (mode !== '--apply' || !backupArgument || !/^[a-f0-9]{64}$/i.test(expectedDigest ?? '')) throw new Error('Se requiere --apply, ruta del respaldo y SHA-256.');
  const root = realpathSync('D:/DatosPC/EVRY/operaciones/respaldos');
  const backup = realpathSync(resolve(backupArgument));
  if (!backup.toLowerCase().startsWith(`${root.toLowerCase()}${sep}`) || !backup.toLowerCase().endsWith('.dump')) throw new Error('El respaldo debe estar en la carpeta local aprobada.');
  const backupBytes = readFileSync(backup);
  if (backupBytes.length < 100 || createHash('sha256').update(backupBytes).digest('hex') !== expectedDigest.toLowerCase()) throw new Error('El hash del respaldo no coincide.');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.hostname !== '127.0.0.1' || url.port !== '55439') throw new Error('Solo se permite la base local aislada en 127.0.0.1:55439.');
  const source = loadSourceExercises();
  const client = createPrismaClient();
  try {
    const result = await client.$transaction(async (tx) => {
      const rows = await tx.exercise.findMany({ where: { sourceId: { not: null } },
        select: { id: true, sourceId: true, name: true, isCustom: true, ownerId: true } });
      const plan = planReviewedNames(source, rows);
      const journal = resolve(root, `nombres-revisados-${randomUUID()}.json`);
      const contents = JSON.stringify({ backup, backupSha256: expectedDigest.toLowerCase(), changes: plan.changes }, null, 2);
      writeFileSync(journal, contents, { flag: 'wx', mode: 0o600, encoding: 'utf8' });
      if (readFileSync(journal, 'utf8') !== contents) throw new Error('No se pudo verificar el registro de reversión.');
      const updated = await applyReviewedNamePlan(tx, plan.changes);
      return { updated, alreadyCorrect: plan.alreadyCorrect, skippedDifferent: plan.skippedDifferent, journal };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    console.log(JSON.stringify(result));
  } finally { await client.$disconnect(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo actualizar el catálogo.');
  process.exitCode = 1;
});
