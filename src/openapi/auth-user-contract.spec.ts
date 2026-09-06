import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi-document';
import { AuthController } from '../modules/auth/auth.controller';
import { MobileAuthController } from '../modules/auth/mobile-auth.controller';
import { AuthService } from '../modules/auth/auth.service';
import { UsersController } from '../modules/users/users.controller';
import { UsersService } from '../modules/users/users.service';
import { WebOriginGuard } from '../modules/auth/web-origin.guard';

let app: INestApplication;
let document: OpenAPIObject;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [AuthController, MobileAuthController, UsersController],
    // Swagger reads the real controllers and DTOs; no HTTP request or database call runs.
    providers: [
      { provide: AuthService, useValue: {} },
      { provide: UsersService, useValue: {} },
      { provide: WebOriginGuard, useValue: { canActivate: () => true } },
      { provide: ConfigService, useValue: { getOrThrow: () => 'http://127.0.0.1:3000' } },
    ],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  document = createOpenApiDocument(app);
});

afterAll(async () => { await app?.close(); });

function schema(name: string): SchemaObject {
  const result = document.components?.schemas?.[name];
  expect(result).toBeDefined();
  return result as SchemaObject;
}

it.each([
  ['/api/v1/auth/register', '201', 'webRegister'],
  ['/api/v1/auth/login', '200', 'webLogin'],
  ['/api/v1/auth/refresh', '200', 'webRefresh'],
])('publishes only the browser access token for %s', (path, status, operationId) => {
  const operation = document.paths[path].post!;
  expect(operation.operationId).toBe(operationId);
  expect(operation.responses[status]).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/AccessToken' } } },
  });
  expect(schema('AccessToken')).toMatchObject({
    required: ['accessToken'],
    properties: { accessToken: { type: 'string' } },
  });
  expect(Object.keys(schema('AccessToken').properties!)).toEqual(['accessToken']);
});

it.each([
  ['/api/v1/auth/mobile/login', 'mobileLogin'],
  ['/api/v1/auth/mobile/refresh', 'mobileRefresh'],
])('publishes the complete mobile token pair for %s', (path, operationId) => {
  const operation = document.paths[path].post!;
  expect(operation.operationId).toBe(operationId);
  expect(operation.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/MobileTokens' } } },
  });
  expect(schema('MobileTokens')).toMatchObject({
    required: ['accessToken', 'refreshToken', 'expiresAt'],
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
      expiresAt: { type: 'string', format: 'date-time' },
    },
  });
});

it('describes cookie refresh, optional-cookie browser logout, and unauthenticated mobile logout', () => {
  expect(document.paths['/api/v1/auth/refresh'].post!.security).toEqual([{ refreshCookie: [] }]);
  expect(document.paths['/api/v1/auth/logout'].post!.security).toEqual([{ refreshCookie: [] }, {}]);
  expect(document.paths['/api/v1/auth/mobile/logout'].post!.security).toEqual([]);
  for (const path of ['/api/v1/auth/logout', '/api/v1/auth/mobile/logout']) {
    expect(document.paths[path].post!.responses['200']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/LogoutResponse' } } },
    });
  }
  expect(schema('LogoutResponse')).toMatchObject({
    required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } },
  });
});

it('documents the minimal authenticated identity separately from a full user profile', () => {
  const operation = document.paths['/api/v1/auth/me'].get!;
  expect(operation.security).toEqual([{ bearer: [] }]);
  expect(operation.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthUser' } } },
  });
  expect(schema('AuthUser')).toMatchObject({
    required: ['id', 'email', 'biologicalSex', 'trackCycle'],
    properties: {
      id: { type: 'string' },
      email: { type: 'string', format: 'email' },
      biologicalSex: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_SAY'] },
      trackCycle: { type: 'boolean' },
    },
  });
  expect(Object.keys(schema('AuthUser').properties!)).toHaveLength(4);
});

it('exposes all selected profile fields while keeping createdAt out of the update response', () => {
  const profile = document.paths['/api/v1/users/me'];
  expect(profile.get!.operationId).toBe('currentUser');
  expect(profile.patch!.operationId).toBe('updateCurrentUser');
  expect(profile.get!.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
  });
  expect(profile.patch!.responses['200']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdatedUser' } } },
  });
  const commonFields = ['id', 'email', 'name', 'biologicalSex', 'birthDate', 'goals', 'trackCycle', 'avgCycleLen', 'avgPeriodLen'];
  expect(schema('User').required).toEqual([...commonFields, 'createdAt']);
  expect(schema('UpdatedUser').required).toEqual(commonFields);
  expect(schema('UpdatedUser').properties).not.toHaveProperty('createdAt');
  expect(schema('User')).toMatchObject({ properties: {
    id: { type: 'string' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    biologicalSex: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_SAY'] },
    birthDate: { type: 'string', format: 'date-time', nullable: true },
    goals: { type: 'array', items: { type: 'string', enum: ['STRENGTH', 'HYPERTROPHY', 'ENDURANCE', 'FAT_LOSS', 'GENERAL_FITNESS', 'MOBILITY'] } },
    trackCycle: { type: 'boolean' },
    avgCycleLen: { type: 'integer' },
    avgPeriodLen: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  } });
  expect(schema('User').properties!.avgCycleLen).not.toHaveProperty('nullable', true);
  expect(schema('User').properties!.avgPeriodLen).not.toHaveProperty('nullable', true);
});

it('publishes real login, registration and mobile refresh validation constraints', () => {
  expect(document.paths['/api/v1/auth/login'].post!.requestBody).toMatchObject({
    required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
  });
  expect(document.paths['/api/v1/auth/register'].post!.requestBody).toMatchObject({
    required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
  });
  for (const path of ['/api/v1/auth/mobile/refresh', '/api/v1/auth/mobile/logout']) {
    expect(document.paths[path].post!.requestBody).toMatchObject({
      required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshInput' } } },
    });
  }
  expect(schema('LoginInput')).toMatchObject({
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', maxLength: 128 },
    },
  });
  expect(schema('LoginInput').properties!.password).not.toHaveProperty('minLength');
  expect(schema('RegisterInput')).toMatchObject({
    required: ['email', 'password', 'name'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
      name: { type: 'string', minLength: 2, maxLength: 100 },
      biologicalSex: { type: 'string', nullable: true, enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_SAY'] },
      trackCycle: { type: 'boolean', nullable: true },
    },
  });
  expect(schema('RefreshInput')).toMatchObject({
    required: ['refreshToken'],
    properties: { refreshToken: { type: 'string', minLength: 64, maxLength: 256 } },
  });
});

it('describes all profile update inputs without adding constraints absent from validation', () => {
  expect(document.paths['/api/v1/users/me'].patch!.requestBody).toMatchObject({
    required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UserUpdateInput' } } },
  });
  const input = schema('UserUpdateInput');
  expect(input.required ?? []).toEqual([]);
  expect(input.properties).toMatchObject({
    name: { type: 'string' },
    biologicalSex: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_SAY'] },
    birthDate: { type: 'string', nullable: true },
    goals: { type: 'array', items: { type: 'string', enum: ['STRENGTH', 'HYPERTROPHY', 'ENDURANCE', 'FAT_LOSS', 'GENERAL_FITNESS', 'MOBILITY'] } },
    trackCycle: { type: 'boolean' },
    avgCycleLen: { type: 'integer', minimum: 20, maximum: 45 },
    avgPeriodLen: { type: 'integer', minimum: 2, maximum: 10 },
  });
  expect(input.properties!.name).not.toHaveProperty('minLength');
  expect(input.properties!.name).not.toHaveProperty('maxLength');
  expect(input.properties!.goals).not.toHaveProperty('maxItems');
  // @IsDateString accepts both ISO calendar dates and date-times, not only one format.
  expect(input.properties!.birthDate).not.toHaveProperty('format');
});

it('links authentication failures and duplicate registration to the normalized error contract', () => {
  for (const path of ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/mobile/login', '/api/v1/auth/mobile/refresh']) {
    expect(document.paths[path].post!.responses['401']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    });
  }
  expect(document.paths['/api/v1/auth/me'].get!.responses['401']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  });
  expect(document.paths['/api/v1/auth/register'].post!.responses['409']).toMatchObject({
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  });
  for (const path of ['/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout']) {
    expect(document.paths[path].post!.responses['403']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    });
  }
});
