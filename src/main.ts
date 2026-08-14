import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { registerExerciseMedia } from './media/exercise-media.middleware';
import { PrismaConnectionExceptionFilter } from './common/filters/prisma-connection-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());
  // __dirname apunta a dist/ al ejecutar la versión compilada; de esta forma
  // los GIF y JPG se sirven aunque el proceso se inicie desde otra carpeta.
  registerExerciseMedia(app, join(__dirname, '..', 'assets', 'exercises'));
  app.enableCors({
    origin: [
      ...(process.env.CORS_ORIGIN ?? 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      'http://127.0.0.1:3000',
    ],
    credentials: true,
  });

  app.setGlobalPrefix('api');
  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.get('/', (_request: Request, response: Response) =>
    response.status(200).json({
      nombre: 'EVRY API',
      estado: 'ok',
      api: '/api',
      documentacion: '/docs',
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
  app.useGlobalFilters(new PrismaConnectionExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('EVRY API')
    .setDescription('Aplicación de entrenamiento adaptativo con integración del ciclo hormonal')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`EVRY API on http://localhost:${port}/api`);
}
bootstrap();
