import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const GYM_VISUAL_ATTRIBUTION = '© Gym visual — https://gymvisual.com/' as const;

export interface ExerciseAssetRecord {
  id: string;
  media_id: string;
  image: string;
  gif_url: string;
  instructions: { es: string; [locale: string]: unknown };
  instruction_steps: { es: string[]; [locale: string]: unknown };
  attribution: string;
  [field: string]: unknown;
}

export interface ExerciseAssetVerificationOptions {
  dataPath: string;
  assetsRoot: string;
  expectedCount?: number;
}

export interface ExerciseAssetVerificationResult {
  records: number;
  images: number;
  gifs: number;
  missing: number;
}

type ImageFormat = 'jpg' | 'gif';
type ImageDimensions = { width: number; height: number };

const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(buffer: Buffer): ImageDimensions {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new Error('El archivo no contiene magic bytes JPEG válidos.');
  }
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (JPEG_START_OF_FRAME.has(marker)) {
      if (segmentLength < 7) break;
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  throw new Error('El JPEG no contiene dimensiones legibles.');
}

function gifDimensions(buffer: Buffer): ImageDimensions {
  const signature = buffer.subarray(0, 6).toString('ascii');
  if (buffer.length < 10 || (signature !== 'GIF87a' && signature !== 'GIF89a')) {
    throw new Error('El archivo no contiene magic bytes GIF válidos.');
  }
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

export function readImageDimensions(path: string, format: ImageFormat): ImageDimensions {
  const descriptor = openSync(path, 'r');
  try {
    const headerLimit = format === 'gif' ? 16 : 1024 * 1024;
    const buffer = Buffer.alloc(Math.min(statSync(path).size, headerLimit));
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);
    return format === 'jpg' ? jpegDimensions(header) : gifDimensions(header);
  } finally {
    closeSync(descriptor);
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseRecord(value: unknown, index: number): ExerciseAssetRecord {
  const record = objectValue(value);
  if (!record) throw new Error(`El registro ${index + 1} no es un objeto.`);
  const instructions = objectValue(record.instructions);
  const instructionSteps = objectValue(record.instruction_steps);
  if (
    typeof record.id !== 'string'
    || typeof record.media_id !== 'string'
    || typeof record.image !== 'string'
    || typeof record.gif_url !== 'string'
    || !instructions
    || !instructionSteps
    || typeof record.attribution !== 'string'
  ) {
    throw new Error(`El registro ${index + 1} no cumple el contrato del dataset.`);
  }
  return {
    ...record,
    id: record.id,
    media_id: record.media_id,
    image: record.image,
    gif_url: record.gif_url,
    instructions: instructions as ExerciseAssetRecord['instructions'],
    instruction_steps: instructionSteps as ExerciseAssetRecord['instruction_steps'],
    attribution: record.attribution,
  };
}

function readRecords(dataPath: string): ExerciseAssetRecord[] {
  const parsed = JSON.parse(readFileSync(dataPath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('El dataset de ejercicios debe ser un arreglo JSON.');
  return parsed.map(parseRecord);
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function safeAssetPath(assetsRoot: string, relativePath: string, exerciseId: string): string {
  if (relativePath.includes('\\') || relativePath.startsWith('/') || relativePath.includes('\0')) {
    throw new Error(`El ejercicio ${exerciseId} contiene una ruta de medio insegura.`);
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new Error(`El ejercicio ${exerciseId} contiene una ruta de medio insegura.`);
  }
  const absolute = resolve(assetsRoot, ...segments);
  if (!isWithin(assetsRoot, absolute)) {
    throw new Error(`El ejercicio ${exerciseId} escapa del directorio de medios.`);
  }
  if (!existsSync(absolute)) throw new Error(`Falta el medio ${relativePath} del ejercicio ${exerciseId}.`);
  const real = realpathSync(absolute);
  if (!isWithin(assetsRoot, real)) {
    throw new Error(`El medio ${relativePath} del ejercicio ${exerciseId} sale del directorio permitido.`);
  }
  return absolute;
}

function nestedFiles(root: string, current: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`El inventario contiene un enlace simbólico no permitido: ${entry.name}.`);
    }
    if (entry.isDirectory()) files.push(...nestedFiles(root, absolute));
    else if (entry.isFile()) files.push(relative(root, absolute).split(sep).join('/'));
    else throw new Error(`El inventario contiene una entrada no regular: ${entry.name}.`);
  }
  return files;
}

function assertSpanishMetadata(record: ExerciseAssetRecord): void {
  const instruction = record.instructions.es;
  if (typeof instruction !== 'string' || instruction.trim().length < 20) {
    throw new Error(`El ejercicio ${record.id} necesita una instrucción útil en español.`);
  }
  const steps = record.instruction_steps.es;
  if (!Array.isArray(steps) || steps.length < 4 || steps.length > 11) {
    throw new Error(`El ejercicio ${record.id} debe tener entre 4 y 11 pasos en español.`);
  }
  if (steps.some((step) => typeof step !== 'string' || !step.trim())) {
    throw new Error(`El ejercicio ${record.id} debe contener pasos no vacíos en español.`);
  }
  if (record.attribution !== GYM_VISUAL_ATTRIBUTION) {
    throw new Error(`El ejercicio ${record.id} no conserva la atribución exacta de Gym Visual.`);
  }
}

function assertDimensions(path: string, format: ImageFormat, exerciseId: string): void {
  const dimensions = readImageDimensions(path, format);
  if (dimensions.width !== 180 || dimensions.height !== 180) {
    throw new Error(`El medio ${format.toUpperCase()} del ejercicio ${exerciseId} debe medir 180x180.`);
  }
}

export function verifyExerciseAssets(
  options: ExerciseAssetVerificationOptions,
): ExerciseAssetVerificationResult {
  const expectedCount = options.expectedCount ?? 1324;
  const assetsRoot = realpathSync(options.assetsRoot);
  const records = readRecords(options.dataPath);
  if (records.length !== expectedCount) {
    throw new Error(`Se esperaban ${expectedCount} ejercicios y se encontraron ${records.length}.`);
  }

  const ids = new Set<string>();
  const imagePaths = new Set<string>();
  const gifPaths = new Set<string>();
  for (const record of records) {
    if (!/^\d{4}$/.test(record.id)) throw new Error(`ID de ejercicio inválido: ${record.id}.`);
    if (ids.has(record.id)) throw new Error(`ID de ejercicio duplicado: ${record.id}.`);
    if (imagePaths.has(record.image)) throw new Error(`El ejercicio ${record.id} usa una ruta de imagen duplicada.`);
    if (gifPaths.has(record.gif_url)) throw new Error(`El ejercicio ${record.id} usa una ruta GIF duplicada.`);
    ids.add(record.id);
    imagePaths.add(record.image);
    gifPaths.add(record.gif_url);

    const expectedImage = `images/${record.id}-${record.media_id}.jpg`;
    const expectedGif = `videos/${record.id}-${record.media_id}.gif`;
    if (record.image !== expectedImage) {
      throw new Error(`El ejercicio ${record.id} tiene un nombre de imagen inconsistente.`);
    }
    if (record.gif_url !== expectedGif) {
      throw new Error(`El ejercicio ${record.id} tiene un nombre GIF inconsistente.`);
    }
    assertSpanishMetadata(record);
    assertDimensions(safeAssetPath(assetsRoot, record.image, record.id), 'jpg', record.id);
    assertDimensions(safeAssetPath(assetsRoot, record.gif_url, record.id), 'gif', record.id);
  }

  const expectedFiles = new Set([...imagePaths, ...gifPaths]);
  const actualFiles = nestedFiles(assetsRoot);
  const extras = actualFiles.filter((path) => !expectedFiles.has(path));
  if (extras.length > 0) {
    throw new Error(`El inventario contiene ${extras.length} archivos extra: ${extras.slice(0, 3).join(', ')}.`);
  }
  if (actualFiles.length !== expectedFiles.size) {
    throw new Error(`El inventario tiene ${actualFiles.length} archivos y se esperaban ${expectedFiles.size}.`);
  }

  return {
    records: records.length,
    images: imagePaths.size,
    gifs: gifPaths.size,
    missing: 0,
  };
}
