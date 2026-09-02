import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { legacyApiAliasMiddleware } from './common/http/api-version.middleware';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import {
  configuredCorsOrigins,
  registerExerciseMedia,
} from './media/exercise-media.middleware';
import { createOpenApiDocument } from './openapi/openapi-document';

interface ConfigureAppOptions {
  exerciseAssetsDirectory?: string;
}

export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions = {},
): void {
  const configService = app.get(ConfigService);
  const swaggerEnabled = configService.getOrThrow<boolean>('SWAGGER_ENABLED');
  const corsOrigins = configuredCorsOrigins(
    configService.getOrThrow<string>('CORS_ORIGIN'),
  );

  app.use(helmet());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(legacyApiAliasMiddleware);
  const exerciseAssetsDirectory = options.exerciseAssetsDirectory
    ?? join(__dirname, '..', 'assets', 'exercises');
  registerExerciseMedia(app, exerciseAssetsDirectory, {
    allowedOrigins: corsOrigins,
  });
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    exposedHeaders: ['Content-Length', 'ETag'],
  });

  app.setGlobalPrefix('api/v1');
  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.get('/', (_request: Request, response: Response) =>
    response.status(200).json({
      nombre: 'EVRY API',
      estado: 'ok',
      api: '/api/v1',
      ...(swaggerEnabled ? { documentacion: '/docs' } : {}),
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  if (swaggerEnabled) {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup('docs', app, document);
  }
}
