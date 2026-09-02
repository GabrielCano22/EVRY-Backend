import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { fileURLToPath } from 'node:url';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export async function createIntegrationApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, {
    exerciseAssetsDirectory: fileURLToPath(new URL('../../assets/exercises', import.meta.url)),
  });
  await app.init();
  return app;
}
