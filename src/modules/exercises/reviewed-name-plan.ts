import { nombreRevisado, nombreRevisadoAnterior, traducirNombreOriginal } from './exercise-localization';

type Source = { id: string; name: string };
type Stored = { id: string; sourceId: string | null; name: string; isCustom: boolean; ownerId: string | null };
export type ReviewedNameChange = { id: string; sourceId: string; expected: string; replacement: string };

/** Only exact reviewed dataset entries with unchanged legacy names are eligible. */
export function planReviewedNames(source: readonly Source[], stored: readonly Stored[]) {
  const sources = new Map(source.map((item) => [item.id, item]));
  const changes: ReviewedNameChange[] = [];
  let alreadyCorrect = 0;
  let skippedDifferent = 0;
  for (const row of stored) {
    if (row.isCustom || row.ownerId !== null || !row.sourceId) continue;
    const item = sources.get(row.sourceId);
    if (!item) continue;
    const replacement = nombreRevisado(item.name);
    if (!replacement) continue;
    if (row.name === replacement) { alreadyCorrect += 1; continue; }
    if (row.name !== traducirNombreOriginal(item.name) && row.name !== nombreRevisadoAnterior(item.name)) { skippedDifferent += 1; continue; }
    changes.push({ id: row.id, sourceId: row.sourceId, expected: row.name, replacement });
  }
  return { changes, alreadyCorrect, skippedDifferent };
}
