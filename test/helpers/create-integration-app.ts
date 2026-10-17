import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export async function createIntegrationApp(clientAddress = `2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g)!.join(':')}`): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  // Independent fixtures must not consume another suite's real shared quota.
  // Override the transport peer only here; forwarded headers remain untrusted.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: clientAddress, configurable: true });
    next();
  });
  configureApp(app, {
    exerciseAssetsDirectory: fileURLToPath(new URL('../../assets/exercises', import.meta.url)),
  });
  await app.init();
  return app;
}
