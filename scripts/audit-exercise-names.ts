import { loadSourceExercises } from '../prisma/import-exercises';
import { traducirNombreEjercicio } from '../src/modules/exercises/exercise-localization';

// Flags are a review queue, not evidence that a name is wrong. Common loanwords
// (for example "press" and "curl") are intentionally not classified as errors.
const englishTerms = /\b(?:alternate|alternating|ankle|archer|arms?|away|backwards|banded|behind|bent|bodyweight|bridge|circular|circles?|down|elbows?|extension|feet|forward|hanging|heel|knees?|lateral|left|legs?|lying|overhead|raise|right|seated|side|single|sitting|standing|straight|stretch|touch|twist|up|weighted|with)\b/i;

const records = loadSourceExercises().map((exercise) => {
  const translated = traducirNombreEjercicio(exercise.name);
  const reasons: string[] = [];
  if (translated.toLocaleLowerCase('es-CO') === exercise.name.toLocaleLowerCase('es-CO')) reasons.push('sin cambio respecto al original');
  if (englishTerms.test(translated)) reasons.push('posibles palabras inglesas');
  return { sourceId: exercise.id, original: exercise.name, propuestaActual: translated, target: exercise.target, motivosRevision: reasons };
});

process.stdout.write(`${JSON.stringify({
  descripcion: 'Inventario para revisión humana; los indicadores no son errores confirmados y no modifica la base de datos.',
  total: records.length,
  marcadosParaRevision: records.filter((record) => record.motivosRevision.length > 0).length,
  ejercicios: records,
}, null, 2)}\n`);
