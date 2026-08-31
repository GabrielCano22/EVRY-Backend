import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import { createOpenApiDocument } from './openapi-document';
import { ExercisesController } from '../modules/exercises/exercises.controller';
import { ExercisesService } from '../modules/exercises/exercises.service';

let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [ExercisesController],
    // No request is executed: this checks metadata on the real production controller.
    providers: [{ provide: ExercisesService, useValue: {} }],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
});
afterAll(async () => { await app?.close(); });

it('publishes an actual typed paginated catalog with media, metadata and authentication', () => {
  const doc = createOpenApiDocument(app);
  const operation = doc.paths['/api/v1/exercises'].get!;
  expect(operation.security).toEqual([{ bearer: [] }]);
  expect(operation.responses['200']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/ExercisePageDto' } } } });
  expect(doc.components?.schemas?.ExercisePageDto).toMatchObject({
    required: ['items', 'page', 'limit', 'total', 'hasMore'],
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/ExerciseListItemDto' } },
      page: { type: 'integer', minimum: 1, maximum: 10000 },
      limit: { type: 'integer', minimum: 1, maximum: 30 },
      total: { type: 'integer', minimum: 0 },
      hasMore: { type: 'boolean' },
    },
  });
  expect(doc.components?.schemas?.ExerciseListItemDto).toMatchObject({ properties: {
    id: { type: 'string' }, name: { type: 'string' },
    imagePath: { type: 'string', nullable: true }, gifPath: { type: 'string', nullable: true },
    imageUrl: { type: 'string', nullable: true }, gifUrl: { type: 'string', nullable: true },
    target: { type: 'string', nullable: true }, equipmentLabel: { type: 'string', nullable: true },
    isCustom: { type: 'boolean' }, attribution: { type: 'string', nullable: true },
  } });
});
