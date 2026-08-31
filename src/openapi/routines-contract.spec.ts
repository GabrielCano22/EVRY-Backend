import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import { RoutinesController } from '../modules/routines/routines.controller';
import { RoutinesService } from '../modules/routines/routines.service';
import { createOpenApiDocument } from './openapi-document';

let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [RoutinesController],
    providers: [{ provide: RoutinesService, useValue: {} }],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
});
afterAll(async () => { await app?.close(); });

it('describes routine lists and full nested exercise targets without untyped items', () => {
  const doc = createOpenApiDocument(app);
  expect(doc.paths['/api/v1/routines'].get?.responses['200']).toMatchObject({ content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Routine' } } } } });
  expect(doc.components?.schemas?.Routine).toMatchObject({ properties: {
    dayOfWeek: { type: 'integer', nullable: true },
    exercises: { type: 'array', items: { $ref: '#/components/schemas/RoutineExercise' } },
  } });
  expect(doc.components?.schemas?.RoutineExercise).toMatchObject({ properties: {
    targetWeightKg: { type: 'number', nullable: true },
    exercise: { $ref: '#/components/schemas/ExerciseEntity' },
  } });
  expect(doc.paths['/api/v1/routines'].post?.responses['201']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/Routine' } } } });
  expect(doc.paths['/api/v1/routines/{id}'].patch?.responses['200']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/Routine' } } } });
  expect(doc.paths['/api/v1/routines/{id}/start'].post?.responses['201']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/Workout' } } } });
});
