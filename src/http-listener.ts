import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export async function listenFromConfiguration(app: INestApplication, config: ConfigService): Promise<string> {
  const port = config.getOrThrow<number>('PORT');
  const host = config.get<string>('HOST');
  if (host === undefined) await app.listen(port);
  else await app.listen(port, host);
  return app.getUrl();
}
