import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi-document';
import { CycleController } from '../modules/cycle/cycle.controller';
import { CycleService } from '../modules/cycle/cycle.service';
import { ReadinessController } from '../modules/readiness/readiness.controller';
import { ReadinessService } from '../modules/readiness/readiness.service';
import { AdaptiveController } from '../modules/adaptive/adaptive.controller';
import { AdaptiveService } from '../modules/adaptive/adaptive.service';
import { HealthController } from '../health/health.controller';
import { HealthService } from '../health/health.service';

let app: INestApplication;
let doc: OpenAPIObject;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [CycleController, ReadinessController, AdaptiveController, HealthController],
    // Swagger inspects real controllers; their database-backed services are never executed.
    providers: [CycleService, ReadinessService, AdaptiveService, HealthService].map((provide) => ({
      provide,
      useValue: {},
    })),
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  doc = createOpenApiDocument(app);
});
afterAll(async () => { await app?.close(); });

it('publishes the cycle entry returned by both the upsert and list routes', () => {
  const path = doc.paths['/api/v1/cycle/entries'];
  expect(path.post?.requestBody).toMatchObject({
    required: true,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/CycleEntryInput' } } },
  });
  expect(path.post?.responses['201']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/CycleEntry' } } },
  });
  expect(path.get?.responses['200']).toMatchObject({
    content: { 'application/json': { schema: {
      type: 'array', items: { $ref: '#/components/schemas/CycleEntry' },
    } } },
  });
  expect(doc.components?.schemas?.CycleEntry).toMatchObject({
    required: ['id', 'userId', 'date', 'flow', 'symptoms', 'energy', 'mood', 'notes', 'isPeriodStart'],
    properties: {
      id: { type: 'string' }, userId: { type: 'string' },
      date: { type: 'string', format: 'date-time' },
      flow: { type: 'string', enum: ['NONE', 'SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY'] },
      symptoms: { type: 'array', items: { type: 'string' } },
      energy: { type: 'integer', nullable: true },
      mood: { type: 'integer', nullable: true },
      notes: { type: 'string', nullable: true },
      isPeriodStart: { type: 'boolean' },
    },
  });
});

it('documents cycle input validation and optional civil-date query filters', () => {
  expect(doc.components?.schemas?.CycleEntryInput).toMatchObject({
    required: ['date'],
    properties: {
      date: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      previousDate: { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      flow: { type: 'string', enum: ['NONE', 'SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY'] },
      symptoms: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } },
      energy: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
      mood: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
      notes: { type: 'string', nullable: true, maxLength: 2000 },
      isPeriodStart: { type: 'boolean' },
    },
  });
  expect(doc.paths['/api/v1/cycle/entries'].get?.parameters).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'from', in: 'query', required: false, schema: expect.objectContaining({ type: 'string', format: 'date' }) }),
    expect.objectContaining({ name: 'to', in: 'query', required: false, schema: expect.objectContaining({ type: 'string', format: 'date' }) }),
  ]));
});

it('documents the cycle deletion acknowledgement, identifier and missing-entry response', () => {
  const operation = doc.paths['/api/v1/cycle/entries/{id}'].delete!;
  expect(operation.parameters).toContainEqual(expect.objectContaining({
    name: 'id', in: 'path', required: true, schema: { type: 'string' },
  }));
  expect(operation.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteCycleEntryResult' } } },
  });
  expect(doc.components?.schemas?.DeleteCycleEntryResult).toMatchObject({
    required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } },
  });
  expect(operation.responses['404']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  });
});

it('publishes a nullable current cycle phase with its civil-date prediction and training context', () => {
  expect(doc.paths['/api/v1/cycle/today'].get?.responses['200']).toMatchObject({
    content: { 'application/json': { schema: {
      type: 'object', nullable: true, allOf: [{ $ref: '#/components/schemas/CyclePhaseInfo' }],
    } } },
  });
  expect(doc.components?.schemas?.CyclePhaseInfo).toMatchObject({
    required: ['phase', 'dayOfCycle', 'cycleLength', 'nextPeriodStart', 'trainingHint', 'intensityCap', 'volumeCap'],
    properties: {
      phase: { type: 'string', enum: ['MENSTRUAL', 'FOLLICULAR', 'OVULATION', 'LUTEAL'] },
      dayOfCycle: { type: 'integer' }, cycleLength: { type: 'integer' },
      nextPeriodStart: { type: 'string', format: 'date', nullable: true },
      trainingHint: { type: 'string' },
      intensityCap: { type: 'number' }, volumeCap: { type: 'number' },
    },
  });
});

it('publishes the complete persisted readiness response and its creation status', () => {
  const operation = doc.paths['/api/v1/readiness/checkin'].post!;
  expect(operation.requestBody).toMatchObject({
    required: true,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadinessInput' } } },
  });
  expect(operation.responses['201']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Readiness' } } },
  });
  expect(doc.components?.schemas?.Readiness).toMatchObject({
    required: ['id', 'userId', 'date', 'civilDate', 'sleepHrs', 'stress', 'soreness', 'motivation', 'score'],
    properties: {
      id: { type: 'string' }, userId: { type: 'string' },
      date: { type: 'string', format: 'date-time' },
      civilDate: { type: 'string', format: 'date-time', nullable: true },
      sleepHrs: { type: 'number', nullable: true },
      stress: { type: 'integer', nullable: true },
      soreness: { type: 'integer', nullable: true },
      motivation: { type: 'integer', nullable: true },
      score: { type: 'number', minimum: 0, maximum: 100 },
    },
  });
});

it('publishes optional nullable readiness inputs with their real validation bounds', () => {
  const schema = doc.components?.schemas?.ReadinessInput;
  expect(schema).toMatchObject({ properties: {
    sleepHrs: { type: 'number', nullable: true, minimum: 0, maximum: 16 },
    stress: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
    soreness: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
    motivation: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
  } });
  expect(schema).not.toHaveProperty('required');
});

it('documents that latest readiness can be null when today has no check-in', () => {
  expect(doc.paths['/api/v1/readiness/latest'].get?.responses['200']).toMatchObject({
    content: { 'application/json': { schema: {
      type: 'object', nullable: true, allOf: [{ $ref: '#/components/schemas/Readiness' }],
    } } },
  });
});

it('publishes typed adaptive recommendations including unavailable targets and bounded confidence', () => {
  const operation = doc.paths['/api/v1/adaptive/recommend/{exerciseId}'].get!;
  expect(operation.parameters).toContainEqual(expect.objectContaining({
    name: 'exerciseId', in: 'path', required: true, schema: { type: 'string' },
  }));
  expect(operation.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/AdaptiveRecommendation' } } },
  });
  expect(doc.components?.schemas?.AdaptiveRecommendation).toMatchObject({
    required: ['exerciseId', 'targetWeightKg', 'targetReps', 'rationale', 'confidence', 'action'],
    properties: {
      exerciseId: { type: 'string' },
      targetWeightKg: { type: 'number', nullable: true },
      targetReps: { type: 'integer', nullable: true },
      rationale: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      action: { type: 'string', enum: ['PROGRESS', 'HOLD', 'DELOAD'] },
    },
  });
});

it('publishes the real liveness and readiness bodies with normalized database-unavailable errors', () => {
  const live = doc.paths['/api/v1/health/live'].get!;
  const ready = doc.paths['/api/v1/health/ready'].get!;
  expect(live.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthLiveness' } } },
  });
  expect(ready.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthReadiness' } } },
  });
  expect(doc.components?.schemas?.HealthLiveness).toMatchObject({
    required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } },
  });
  expect(doc.components?.schemas?.HealthReadiness).toMatchObject({
    required: ['status', 'database'],
    properties: { status: { type: 'string', enum: ['ok'] }, database: { type: 'string', enum: ['ready'] } },
  });
  expect(ready.responses['503']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  });
  expect(live.security ?? []).toEqual([]);
  expect(ready.security ?? []).toEqual([]);
});

it.each([
  ['/api/v1/cycle/entries', 'get'],
  ['/api/v1/cycle/entries', 'post'],
  ['/api/v1/cycle/entries/{id}', 'delete'],
  ['/api/v1/cycle/today', 'get'],
  ['/api/v1/readiness/checkin', 'post'],
  ['/api/v1/readiness/latest', 'get'],
  ['/api/v1/adaptive/recommend/{exerciseId}', 'get'],
] as const)('requires bearer authentication for %s %s', (path, method) => {
  expect(doc.paths[path][method]?.security).toEqual([{ bearer: [] }]);
});
