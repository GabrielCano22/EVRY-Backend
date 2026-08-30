import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import {
  configuredCorsOrigins,
  registerExerciseMedia,
} from './media/exercise-media.middleware';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { legacyApiAliasMiddleware } from './common/http/api-version.middleware';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { createOpenApiDocument } from './openapi/openapi-document';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const swaggerEnabled = configService.getOrThrow<boolean>('SWAGGER_ENABLED');

  app.use(helmet());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(legacyApiAliasMiddleware);
  const corsOrigins = configuredCorsOrigins(configService.getOrThrow<string>('CORS_ORIGIN'));
  // __dirname apunta a dist/ al ejecutar la versión compilada; de esta forma
  // los GIF y JPG se sirven aunque el proceso se inicie desde otra carpeta.
  registerExerciseMedia(app, join(__dirname, '..', 'assets', 'exercises'), {
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
    const doc = createOpenApiDocument(app);
    SwaggerModule.setup('docs', app, doc);
  }

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
  console.log(`EVRY API on http://localhost:${port}/api/v1`);
}
bootstrap();
