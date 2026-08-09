import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';

type DatasetExercise = {
  id: string;
  image: string;
  gif_url: string;
};

const root = resolve(__dirname, '..');
const dataPath = resolve(root, 'prisma', 'seed-data', 'exercises.json');
const assetsRoot = resolve(root, 'assets', 'exercises');

function readDataset(): DatasetExercise[] {
  const parsed = JSON.parse(readFileSync(dataPath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('The exercise dataset must be a JSON array');
  return parsed as DatasetExercise[];
}

function assertLocalAsset(relativePath: string, expectedDirectory: 'images' | 'videos', id: string) {
  const normalized = relativePath.replaceAll('\\', '/');
  const prefix = `${expectedDirectory}/`;
  if (!normalized.startsWith(prefix) || basename(normalized) !== normalized.slice(prefix.length)) {
    throw new Error(`Exercise ${id} has an unsafe ${expectedDirectory} path: ${relativePath}`);
  }

  const absolutePath = resolve(assetsRoot, normalized);
  const expectedRoot = resolve(assetsRoot, expectedDirectory);
  if (!absolutePath.startsWith(`${expectedRoot}${sep}`) && !absolutePath.startsWith(`${expectedRoot}/`)) {
    throw new Error(`Exercise ${id} escapes the ${expectedDirectory} asset directory`);
  }
  if (!existsSync(absolutePath)) throw new Error(`Missing ${expectedDirectory} asset for exercise ${id}: ${relativePath}`);
}

const records = readDataset();
if (records.length !== 1324) throw new Error(`Expected 1324 exercises, found ${records.length}`);

const ids = new Set<string>();
for (const record of records) {
  if (!/^\d{4}$/.test(record.id)) throw new Error(`Invalid exercise id: ${record.id}`);
  if (ids.has(record.id)) throw new Error(`Duplicate exercise id: ${record.id}`);
  ids.add(record.id);
  assertLocalAsset(record.image, 'images', record.id);
  assertLocalAsset(record.gif_url, 'videos', record.id);
}

console.log(`Verified ${records.length} records; ${records.length} images; ${records.length} gifs; 0 missing.`);
