import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readImageDimensions,
  verifyExerciseAssets,
  type ExerciseAssetRecord,
} from './exercise-assets-verifier';

const attribution = '© Gym visual — https://gymvisual.com/';
const repositoryRoot = process.cwd();
const realAssets = join(repositoryRoot, 'assets', 'exercises');

function validRecord(): ExerciseAssetRecord {
  return {
    id: '0001',
    media_id: '2gPfomN',
    image: 'images/0001-2gPfomN.jpg',
    gif_url: 'videos/0001-2gPfomN.gif',
    instructions: { es: 'Mantén el control durante todo el movimiento y respira con normalidad.' },
    instruction_steps: {
      es: ['Adopta la posición inicial.', 'Activa el abdomen.', 'Realiza el movimiento.', 'Regresa con control.'],
    },
    attribution,
  };
}

function fixture(): {
  root: string;
  dataPath: string;
  assetsRoot: string;
  record: ExerciseAssetRecord;
} {
  const root = mkdtempSync(join(tmpdir(), 'evry-assets-'));
  const assetsRoot = join(root, 'assets');
  const images = join(assetsRoot, 'images');
  const videos = join(assetsRoot, 'videos');
  mkdirSync(images, { recursive: true });
  mkdirSync(videos, { recursive: true });
  copyFileSync(join(realAssets, 'images', '0001-2gPfomN.jpg'), join(images, '0001-2gPfomN.jpg'));
  copyFileSync(join(realAssets, 'videos', '0001-2gPfomN.gif'), join(videos, '0001-2gPfomN.gif'));
  const dataPath = join(root, 'exercises.json');
  const record = validRecord();
  writeFileSync(dataPath, JSON.stringify([record]));
  return { root, dataPath, assetsRoot, record };
}

describe('exercise asset verifier', () => {
  const temporaryRoots: string[] = [];

  afterEach(() => {
    while (temporaryRoots.length > 0) {
      rmSync(temporaryRoots.pop() as string, { recursive: true, force: true });
    }
  });

  it('verifies the real 1,324-record catalog with exact inventories and metadata', () => {
    expect(verifyExerciseAssets({
      dataPath: join(repositoryRoot, 'prisma', 'seed-data', 'exercises.json'),
      assetsRoot: realAssets,
      expectedCount: 1324,
    })).toEqual({ records: 1324, images: 1324, gifs: 1324, missing: 0 });
  });

  it('reads 180x180 dimensions from the actual JPEG and GIF formats', () => {
    expect(readImageDimensions(join(realAssets, 'images', '0001-2gPfomN.jpg'), 'jpg'))
      .toEqual({ width: 180, height: 180 });
    expect(readImageDimensions(join(realAssets, 'videos', '0001-2gPfomN.gif'), 'gif'))
      .toEqual({ width: 180, height: 180 });
  });

  it('accepts a minimal exact fixture', () => {
    const current = fixture();
    temporaryRoots.push(current.root);

    expect(verifyExerciseAssets({
      dataPath: current.dataPath,
      assetsRoot: current.assetsRoot,
      expectedCount: 1,
    })).toEqual({ records: 1, images: 1, gifs: 1, missing: 0 });
  });

  it('rejects extra files outside the declared inventory', () => {
    const current = fixture();
    temporaryRoots.push(current.root);
    copyFileSync(
      join(realAssets, 'images', '0001-2gPfomN.jpg'),
      join(current.assetsRoot, 'images', 'extra.jpg'),
    );

    expect(() => verifyExerciseAssets({
      dataPath: current.dataPath,
      assetsRoot: current.assetsRoot,
      expectedCount: 1,
    })).toThrow('archivos extra');
  });

  it('rejects duplicated media paths before accepting a catalog', () => {
    const current = fixture();
    temporaryRoots.push(current.root);
    writeFileSync(current.dataPath, JSON.stringify([
      current.record,
      { ...current.record, id: '0002' },
    ]));

    expect(() => verifyExerciseAssets({
      dataPath: current.dataPath,
      assetsRoot: current.assetsRoot,
      expectedCount: 2,
    })).toThrow('ruta de imagen duplicada');
  });

  it('rejects a file whose magic bytes do not match its declared format', () => {
    const current = fixture();
    temporaryRoots.push(current.root);
    copyFileSync(
      join(realAssets, 'videos', '0001-2gPfomN.gif'),
      join(current.assetsRoot, current.record.image),
    );

    expect(() => verifyExerciseAssets({
      dataPath: current.dataPath,
      assetsRoot: current.assetsRoot,
      expectedCount: 1,
    })).toThrow('magic bytes JPEG');
  });

  it('rejects media dimensions other than 180x180', () => {
    const current = fixture();
    temporaryRoots.push(current.root);
    const gif = Buffer.from('474946383961b300b400800000000000ffffff', 'hex');
    writeFileSync(join(current.assetsRoot, current.record.gif_url), gif);

    expect(() => verifyExerciseAssets({
      dataPath: current.dataPath,
      assetsRoot: current.assetsRoot,
      expectedCount: 1,
    })).toThrow('debe medir 180x180');
  });

  it.each([
    ['Spanish instructions', (record: ExerciseAssetRecord) => { record.instructions.es = '  '; }, 'instrucción útil'],
    ['too few steps', (record: ExerciseAssetRecord) => { record.instruction_steps.es = ['a', 'b', 'c']; }, '4 y 11 pasos'],
    ['empty step', (record: ExerciseAssetRecord) => { record.instruction_steps.es[2] = ' '; }, 'pasos no vacíos'],
    ['attribution', (record: ExerciseAssetRecord) => { record.attribution = 'Otra fuente'; }, 'atribución exacta'],
    ['filename', (record: ExerciseAssetRecord) => { record.image = 'images/wrong.jpg'; }, 'nombre de imagen'],
  ] as const)('rejects invalid %s metadata', (_label, mutate, message) => {
    const current = fixture();
    temporaryRoots.push(current.root);
    mutate(current.record);
    writeFileSync(current.dataPath, JSON.stringify([current.record]));

    expect(() => verifyExerciseAssets({
      dataPath: current.dataPath,
      assetsRoot: current.assetsRoot,
      expectedCount: 1,
    })).toThrow(message);
  });
});
