import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import {
  configuredCorsOrigins,
  registerExerciseMedia,
} from './media/exercise-media.middleware';
import { PrismaConnectionExceptionFilter } from './common/filters/prisma-connection-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const swaggerEnabled = configService.getOrThrow<boolean>('SWAGGER_ENABLED');

  app.use(helmet());
  app.use(cookieParser());
  const corsOrigins = configuredCorsOrigins(process.env.CORS_ORIGIN);
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

  app.setGlobalPrefix('api');
  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.get('/', (_request: Request, response: Response) =>
    response.status(200).json({
      nombre: 'EVRY API',
      estado: 'ok',
      api: '/api',
      ...(swaggerEnabled ? { documentacion: '/docs' } : {}),
    }),
  );
  httpServer.get('/health', (_request: Request, response: Response) =>
    response.status(200).json({ estado: 'ok' }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new PrismaExceptionFilter(),
    new PrismaConnectionExceptionFilter(),
  );

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('EVRY API')
      .setDescription('Aplicación de entrenamiento adaptativo con integración del ciclo hormonal')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, doc);
  }

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
  console.log(`EVRY API on http://localhost:${port}/api`);
}
bootstrap();
