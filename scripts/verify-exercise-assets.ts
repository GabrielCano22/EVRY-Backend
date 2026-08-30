import { resolve } from 'node:path';
import { verifyExerciseAssets } from '../src/media/exercise-assets-verifier';

const root = resolve(__dirname, '..');
const dataPath = resolve(root, 'prisma', 'seed-data', 'exercises.json');
const assetsRoot = resolve(root, 'assets', 'exercises');

const result = verifyExerciseAssets({ dataPath, assetsRoot, expectedCount: 1324 });
console.log(
  `Verified ${result.records} records; ${result.images} images; ${result.gifs} gifs; ${result.missing} missing.`,
);
