import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());
  // __dirname apunta a dist/ al ejecutar la versión compilada; de esta forma
  // los GIF y JPG se sirven aunque el proceso se inicie desde otra carpeta.
  app.use(
    '/media/exercises',
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(join(__dirname, '..', 'assets', 'exercises'), {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
    }),
  );
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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
