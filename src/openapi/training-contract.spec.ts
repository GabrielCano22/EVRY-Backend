import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi-document';
import { WorkoutsController } from '../modules/workouts/workouts.controller';
import { WorkoutsService } from '../modules/workouts/workouts.service';
import { SyncController } from '../modules/sync/sync.controller';
import { SyncService } from '../modules/sync/sync.service';
import { ProgressController } from '../modules/progress/progress.controller';
import { ProgressService } from '../modules/progress/progress.service';

let app: INestApplication;
let document: OpenAPIObject;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [WorkoutsController, SyncController, ProgressController],
    // Only real controller/DTO metadata is exercised; no route or database call runs.
    providers: [WorkoutsService, SyncService, ProgressService].map((provide) => ({
      provide,
      useValue: {},
    })),
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  document = createOpenApiDocument(app);
});

afterAll(async () => { await app?.close(); });

function schema(name: string): SchemaObject {
  const value = document.components?.schemas?.[name];
  expect(value).toBeDefined();
  return value as SchemaObject;
}

it.each([
  ['/api/v1/workouts', 'post', '201', 'Workout'],
  ['/api/v1/workouts/{id}', 'get', '200', 'Workout'],
  ['/api/v1/workouts/{id}', 'patch', '200', 'Workout'],
  ['/api/v1/workouts/{id}/finish', 'post', '201', 'Workout'],
  ['/api/v1/workouts/{id}/cancel', 'post', '201', 'Workout'],
  ['/api/v1/workouts/{id}/sets', 'post', '201', 'WorkoutSet'],
  ['/api/v1/workouts/sets/{setId}', 'patch', '200', 'WorkoutSet'],
  ['/api/v1/sync/workouts', 'post', '201', 'SyncWorkoutResult'],
  ['/api/v1/progress/overview', 'get', '200', 'ProgressOverview'],
  ['/api/v1/progress/activity', 'get', '200', 'ProgressActivity'],
  ['/api/v1/progress/exercises/{id}', 'get', '200', 'ExerciseProgress'],
  ['/api/v1/progress/exercise/{id}', 'get', '200', 'ExerciseProgress'],
])('publishes the real %s %s success status and response', (path, method, status, model) => {
  const operation = document.paths[path][method as 'get' | 'post' | 'patch']!;
  expect(operation.responses[status]).toMatchObject({ content: { 'application/json': {
    schema: { $ref: `#/components/schemas/${model}` },
  } } });
  expect(operation.security).toEqual([{ bearer: [] }]);
  if (method === 'post') expect(operation.responses['200']).toBeUndefined();
});

it('publishes detailed workouts and sets without inventing serialized exercise media', () => {
  expect(document.paths['/api/v1/workouts'].get?.responses['200']).toMatchObject({
    content: { 'application/json': { schema: {
      type: 'array', items: { $ref: '#/components/schemas/Workout' },
    } } },
  });
  expect(schema('Workout')).toMatchObject({
    required: expect.arrayContaining(['id', 'userId', 'notes', 'routineId', 'routine', 'sets', 'lastSyncId', 'createdAt', 'updatedAt']),
    properties: {
      status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'] },
      clientId: { type: 'string', format: 'uuid', nullable: true },
      lastSyncId: { type: 'string', format: 'uuid', nullable: true },
      endedAt: { type: 'string', format: 'date-time', nullable: true },
      notes: { type: 'string', nullable: true },
      sets: { type: 'array', items: { $ref: '#/components/schemas/WorkoutSet' } },
      routine: { nullable: true, allOf: [{ $ref: '#/components/schemas/Routine' }] },
    },
  });
  expect(schema('WorkoutSet')).toMatchObject({
    required: expect.arrayContaining(['workoutId', 'exercise', 'clientMutationId', 'weightKg', 'techniqueStable', 'updatedAt']),
    properties: {
      exercise: { $ref: '#/components/schemas/ExerciseEntity' },
      weightKg: { type: 'number', nullable: true },
      reps: { type: 'integer', nullable: true },
      clientMutationId: { type: 'string', nullable: true },
      techniqueStable: { type: 'boolean', nullable: true },
    },
  });
  expect(schema('ExerciseEntity').properties).not.toHaveProperty('imageUrl');
  expect(schema('ExerciseEntity').properties).not.toHaveProperty('gifUrl');
});

it('describes workout mutations and pagination with their actual validation constraints', () => {
  expect(schema('CreateWorkoutInput')).toMatchObject({ required: ['name'], properties: {
    name: { type: 'string', minLength: 1 }, notes: { type: 'string' }, routineId: { type: 'string' },
  } });
  expect(schema('CreateWorkoutInput').properties).not.toHaveProperty('clientId');
  expect(schema('CreateWorkoutInput').properties?.notes).not.toHaveProperty('nullable', true);
  expect(schema('CreateSetInput')).toMatchObject({
    required: ['exerciseId', 'order', 'clientMutationId'],
    properties: {
      order: { type: 'integer', minimum: 0 },
      clientMutationId: { type: 'string', format: 'uuid' },
      reps: { type: 'integer', minimum: 0 },
      rpe: { type: 'integer', minimum: 1, maximum: 10 },
    },
  });
  expect(schema('UpdateSetInput')).toMatchObject({ properties: {
    weightKg: { type: 'number', minimum: 0, nullable: true },
    reps: { type: 'integer', minimum: 0, nullable: true },
    techniqueStable: { type: 'boolean', nullable: true },
    isWarmup: { type: 'boolean' },
  } });
  expect(schema('UpdateSetInput').properties?.isWarmup).not.toHaveProperty('nullable', true);
  expect(document.paths['/api/v1/workouts'].get?.parameters).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'take', in: 'query', required: false, schema: expect.objectContaining({ type: 'integer', default: 20 }) }),
    expect.objectContaining({ name: 'skip', in: 'query', required: false, schema: expect.objectContaining({ type: 'integer', default: 0 }) }),
  ]));
  for (const path of ['/api/v1/workouts/{id}', '/api/v1/workouts/sets/{setId}']) {
    expect(document.paths[path].delete?.responses['200']).toMatchObject({ content: {
      'application/json': { schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } } },
    } });
  }
});

it('describes sync limits, nullable inputs, mapping and canonical conflict payload', () => {
  expect(schema('SyncWorkoutInput')).toMatchObject({
    required: ['clientId', 'syncId', 'baseRevision', 'name', 'startedAt', 'status', 'sets', 'deletedSetClientIds'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      notes: { type: 'string', nullable: true, maxLength: 2000 },
      routineId: { type: 'string', nullable: true, maxLength: 64 },
      endedAt: { type: 'string', nullable: true, format: 'date-time' },
      sets: { type: 'array', maxItems: 250, items: { $ref: '#/components/schemas/SyncWorkoutSetInput' } },
      deletedSetClientIds: { type: 'array', maxItems: 250, items: { type: 'string', format: 'uuid' } },
    },
  });
  expect(schema('SyncWorkoutSetInput')).toMatchObject({ properties: {
    exerciseId: { type: 'string', minLength: 1, maxLength: 64 },
    weightKg: { type: 'number', nullable: true, minimum: 0, maximum: 2000 },
    reps: { type: 'integer', nullable: true, minimum: 0, maximum: 1000 },
    durationS: { type: 'integer', nullable: true, minimum: 0, maximum: 86400 },
    completedAt: { type: 'string', nullable: true, format: 'date-time' },
  } });
  expect(schema('SyncWorkoutResult')).toMatchObject({ required: ['workout', 'revision', 'mapping'], properties: {
    workout: { $ref: '#/components/schemas/SyncCanonicalWorkout' },
    mapping: { $ref: '#/components/schemas/SyncWorkoutMapping' },
  } });
  expect(schema('SyncCanonicalWorkout')).toMatchObject({ properties: {
    sets: { type: 'array', items: { $ref: '#/components/schemas/WorkoutSet' } },
    routine: { nullable: true, allOf: [{ $ref: '#/components/schemas/RoutineEntity' }] },
  } });
  expect(schema('RoutineEntity').properties).not.toHaveProperty('exercises');
  expect(schema('SyncWorkoutMapping')).toMatchObject({ properties: {
    workout: { $ref: '#/components/schemas/SyncWorkoutIdentity' },
    sets: { type: 'array', items: { $ref: '#/components/schemas/SyncSetIdentity' } },
  } });
  expect(document.paths['/api/v1/sync/workouts'].post?.responses['409']).toMatchObject({
    content: { 'application/json': { schema: { allOf: [
      { $ref: '#/components/schemas/ApiError' },
      { type: 'object', required: ['serverVersion'], properties: {
        serverVersion: { nullable: true, allOf: [{ $ref: '#/components/schemas/SyncCanonicalWorkout' }] },
      } },
    ] } } },
  });
});

it('publishes typed progress metrics, nullable records and signed comparison deltas', () => {
  expect(schema('ProgressOverview')).toMatchObject({
    required: ['period', 'summary', 'comparison', 'records', 'muscleDistribution', 'streakDays', 'recentWorkouts'],
    properties: {
      period: { $ref: '#/components/schemas/ProgressPeriodWindow' },
      summary: { $ref: '#/components/schemas/OverviewMetrics' },
      comparison: { nullable: true, allOf: [{ $ref: '#/components/schemas/OverviewComparison' }] },
      records: { type: 'array', items: { $ref: '#/components/schemas/ProgressRecord' } },
      muscleDistribution: { type: 'array', items: { $ref: '#/components/schemas/MuscleDistribution' } },
      streakDays: { type: 'integer', minimum: 0 },
      recentWorkouts: { type: 'array', maxItems: 5, items: { $ref: '#/components/schemas/RecentWorkoutSummary' } },
    },
  });
  expect(schema('RecentWorkoutSummary')).toMatchObject({
    required: ['id', 'name', 'startedAt', 'endedAt', 'setCount', 'volumeKg'],
    properties: {
      startedAt: { type: 'string', format: 'date-time' },
      endedAt: { type: 'string', format: 'date-time' },
      setCount: { type: 'integer', minimum: 0 },
      volumeKg: { type: 'number', minimum: 0 },
    },
  });
  expect(schema('ProgressPeriodWindow')).toMatchObject({ properties: {
    from: { type: 'string', format: 'date', nullable: true },
    to: { type: 'string', format: 'date' },
    timezone: { type: 'string', enum: ['America/Bogota'] },
  } });
  expect(schema('OverviewMetrics')).toMatchObject({ properties: {
    sessionsCompleted: { type: 'integer', minimum: 0 },
    weeklyFrequency: { type: 'number', minimum: 0 },
  } });
  expect(schema('OverviewComparison')).toMatchObject({ properties: {
    previous: { $ref: '#/components/schemas/OverviewMetrics' },
    delta: { $ref: '#/components/schemas/OverviewMetricDelta' },
  } });
  for (const name of ['OverviewMetricDelta', 'ExercisePeriodMetricDelta']) {
    for (const property of Object.values(schema(name).properties ?? {})) expect(property).not.toHaveProperty('minimum');
  }
  expect(schema('ExerciseProgressSummary')).toMatchObject({ properties: {
    bestWeight: { nullable: true, allOf: [{ $ref: '#/components/schemas/BestWeightRecord' }] },
    repetitionRecord: { nullable: true, allOf: [{ $ref: '#/components/schemas/RepetitionRecord' }] },
    estimated1RM: { nullable: true, allOf: [{ $ref: '#/components/schemas/Estimated1RMRecord' }] },
  } });
  expect(schema('Estimated1RMRecord')).toMatchObject({ properties: { formula: { type: 'string', enum: ['EPLEY'] } } });
});

it('publishes cursor history, activity dates, and query defaults for both exercise-progress routes', () => {
  expect(schema('ExerciseProgress')).toMatchObject({ required: ['exerciseId', 'period', 'summary', 'comparison', 'points', 'history'], properties: {
    history: { $ref: '#/components/schemas/ExerciseProgressHistory' },
    points: { type: 'array', items: { $ref: '#/components/schemas/ExerciseProgressPoint' } },
  } });
  expect(schema('ExerciseProgressHistory')).toMatchObject({
    required: ['items', 'page', 'limit', 'total', 'hasMore', 'nextCursor'],
    properties: {
      page: { type: 'integer', nullable: true, minimum: 1 },
      nextCursor: { type: 'string', nullable: true },
      items: { type: 'array', items: { $ref: '#/components/schemas/ExerciseHistorySession' } },
    },
  });
  expect(schema('ExerciseHistorySession')).toMatchObject({ properties: {
    endedAt: { type: 'string', format: 'date-time' },
    sets: { type: 'array', items: { $ref: '#/components/schemas/ExerciseHistorySet' } },
  } });
  expect(schema('ExerciseHistorySet')).toMatchObject({ properties: {
    reps: { type: 'integer', nullable: true },
    rpe: { type: 'integer', nullable: true },
  } });
  for (const path of ['/api/v1/progress/exercises/{id}', '/api/v1/progress/exercise/{id}']) {
    expect(document.paths[path].get?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'period', required: false, schema: expect.objectContaining({ type: 'string', enum: ['30d', '90d', '6m', '1y', 'all'], default: '30d' }) }),
      expect.objectContaining({ name: 'page', required: false, schema: expect.objectContaining({ type: 'integer', minimum: 1, default: 1 }) }),
      expect.objectContaining({ name: 'limit', required: false, schema: expect.objectContaining({ type: 'integer', minimum: 1, maximum: 25, default: 10 }) }),
      expect.objectContaining({ name: 'cursor', required: false, schema: expect.objectContaining({ type: 'string', minLength: 1, maxLength: 512 }) }),
    ]));
  }
  expect(schema('ProgressActivity')).toMatchObject({ required: ['from', 'to', 'days'], properties: {
    from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
    days: { type: 'array', items: { $ref: '#/components/schemas/ProgressActivityDay' } },
  } });
  expect(document.paths['/api/v1/progress/activity'].get?.parameters).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'from', required: true, schema: expect.objectContaining({ type: 'string', format: 'date' }) }),
    expect.objectContaining({ name: 'to', required: true, schema: expect.objectContaining({ type: 'string', format: 'date' }) }),
  ]));
});
