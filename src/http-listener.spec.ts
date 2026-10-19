import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';
import { listenFromConfiguration } from './http-listener';

@Module({})
class ListenerFixtureModule {}

describe('configured HTTP listener', () => {
  it('binds the real socket only to configured loopback and reports its actual URL', async () => {
    const app = await NestFactory.create(ListenerFixtureModule, { logger: false });
    await app.init();
    try {
      const url = await listenFromConfiguration(app, new ConfigService({ PORT: 0, HOST: '127.0.0.1' }));
      const address = app.getHttpServer().address() as AddressInfo;
      expect(address.address).toBe('127.0.0.1');
      expect(address.port).toBeGreaterThan(0);
      expect(url).toBe(`http://127.0.0.1:${address.port}`);
    } finally {
      await app.close();
    }
  });

  it('preserves the operating system all-interface default when HOST is omitted', async () => {
    const previousHost = process.env.HOST;
    delete process.env.HOST;
    const app = await NestFactory.create(ListenerFixtureModule, { logger: false });
    await app.init();
    try {
      const url = await listenFromConfiguration(app, new ConfigService({ PORT: 0 }));
      const address = app.getHttpServer().address() as AddressInfo;
      expect(['::', '0.0.0.0']).toContain(address.address);
      expect(new URL(url).port).toBe(String(address.port));
    } finally {
      if (previousHost === undefined) delete process.env.HOST;
      else process.env.HOST = previousHost;
      await app.close();
    }
  });
});
