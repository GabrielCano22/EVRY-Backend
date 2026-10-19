import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { listenFromConfiguration } from './http-listener';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const configService = app.get(ConfigService);
  const url = await listenFromConfiguration(app, configService);
  console.log(`EVRY API on ${url}/api/v1`);
}
bootstrap();
