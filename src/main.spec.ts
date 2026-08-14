import { once } from 'node:events';
import { createServer, request, type Server } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import { registerExerciseMedia } from './media/exercise-media.middleware';

const mediaPath = '/media/exercises/videos/0001-2gPfomN.gif';

function requestHead(server: Server) {
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('El servidor de prueba no expuso un puerto TCP.');
  }

  return new Promise<{ statusCode?: number; headers: Record<string, string | string[] | undefined> }>(
    (resolve, reject) => {
      const call = request(
        {
          hostname: '127.0.0.1',
          method: 'HEAD',
          path: mediaPath,
          port: address.port,
        },
        (response) => {
          response.resume();
          resolve({ statusCode: response.statusCode, headers: response.headers });
        },
      );
      call.on('error', reject);
      call.end();
    },
  );
}

describe('servidor de medios de ejercicios', () => {
  let server: Server;

  beforeAll(async () => {
    const app = express();
    registerExerciseMedia(app, join(process.cwd(), 'assets', 'exercises'));
    server = createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  });

  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  it('permite que la interfaz en otro origen renderice los GIF locales', async () => {
    const response = await requestHead(server);

    expect(response.statusCode).toBe(200);
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
