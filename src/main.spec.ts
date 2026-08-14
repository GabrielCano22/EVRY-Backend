import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { once } from 'node:events';

const testPort = 4011;
const mediaPath = '/media/exercises/videos/0001-2gPfomN.gif';

function requestHead() {
  return new Promise<{ statusCode?: number; headers: Record<string, string | string[] | undefined> }>(
    (resolve, reject) => {
      const call = request(
        {
          hostname: '127.0.0.1',
          method: 'HEAD',
          path: mediaPath,
          port: testPort,
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

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      return await requestHead();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error('El servidor de prueba no inició a tiempo.');
}

describe('servidor de medios de ejercicios', () => {
  let api: ChildProcess;
  let serverOutput = '';

  beforeAll(async () => {
    api = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/main.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(testPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    api.stdout?.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    api.stderr?.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    api.once('error', (error) => {
      serverOutput += error.message;
    });
    api.once('exit', (code, signal) => {
      serverOutput += `Proceso terminado (código ${code}, señal ${signal}).`;
    });

    try {
      await waitForServer();
    } catch {
      throw new Error(`El servidor de prueba no inició a tiempo. ${serverOutput}`);
    }
  }, 60_000);

  afterAll(async () => {
    if (api?.exitCode === null) {
      api.kill();
      await Promise.race([
        once(api, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  });

  it('permite que la interfaz en otro origen renderice los GIF locales', async () => {
    const response = await requestHead();

    expect(response.statusCode).toBe(200);
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
