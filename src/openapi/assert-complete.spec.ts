import type { OpenAPIObject, ResponseObject } from '@nestjs/swagger';
import { assertCompleteContract } from './assert-complete';

const document = (responses: Record<string, ResponseObject>): OpenAPIObject => ({
  openapi: '3.0.0', info: { title: 'Fixture', version: '1' },
  paths: { '/api/v1/example': { get: { operationId: 'example', responses } } },
});

it('rejects an endpoint whose success body cannot generate a client type', () => {
  expect(() => assertCompleteContract(document({ 200: { description: '' } }))).toThrow(/GET \/api\/v1\/example/);
});
it('accepts typed JSON and true no-content success responses', () => {
  expect(() => assertCompleteContract(document({ 200: { description: 'typed', content: { 'application/json': { schema: { type: 'string' } } } } }))).not.toThrow();
  expect(() => assertCompleteContract(document({ 204: { description: 'No content' } }))).not.toThrow();
});
