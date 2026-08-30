import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

const API_ERROR_SCHEMA = {
  type: 'object' as const,
  required: ['code', 'message', 'retryable', 'requestId'],
  properties: {
    code: { type: 'string' as const },
    message: { type: 'string' as const },
    fieldErrors: {
      type: 'object' as const,
      additionalProperties: { type: 'array' as const, items: { type: 'string' as const } },
    },
    retryable: { type: 'boolean' as const },
    requestId: { type: 'string' as const },
  },
};

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('EVRY API')
    .setDescription('API privada de seguimiento de fuerza EVRY')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, { ignoreGlobalPrefix: false });
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ApiError = API_ERROR_SCHEMA;

  for (const [path, pathItem] of Object.entries(document.paths)) {
    const publicRoute = path.startsWith('/api/v1/auth/') || path.startsWith('/api/v1/health/');
    for (const operation of Object.values(pathItem ?? {})) {
      if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
      if (!publicRoute) operation.security = [{ bearer: [] }];
      operation.responses['400'] ??= errorResponse('Solicitud inválida.');
      if (!publicRoute) operation.responses['401'] ??= errorResponse('Autenticación requerida.');
      operation.responses['429'] ??= errorResponse('Límite de solicitudes alcanzado.');
      operation.responses['500'] ??= errorResponse('Error interno normalizado.');
    }
  }
  return document;
}

function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  };
}
