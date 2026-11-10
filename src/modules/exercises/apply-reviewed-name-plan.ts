import type { Prisma } from '@prisma/client';
import type { ReviewedNameChange } from './reviewed-name-plan';

/** Caller owns the transaction; any concurrent edit aborts the entire batch. */
export async function applyReviewedNamePlan(tx: Pick<Prisma.TransactionClient, 'exercise'>, changes: readonly ReviewedNameChange[]) {
  for (const change of changes) {
    const result = await tx.exercise.updateMany({
      where: { id: change.id, sourceId: change.sourceId, name: change.expected, isCustom: false, ownerId: null },
      data: { name: change.replacement },
    });
    if (result.count !== 1) throw new Error('El catálogo cambió durante la actualización; se revirtió todo el lote.');
  }
  return changes.length;
}
