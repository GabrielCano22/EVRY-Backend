// Dedicated compiled application process; no testing-module guard overrides.
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');

let app;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try { if (app) await app.close(); process.exit(0); }
  catch { process.exit(1); }
}
process.on('message', (message) => { if (message === 'close') void close(); });
process.on('disconnect', () => { void close(); });
process.on('SIGTERM', () => { void close(); });

(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  process.send({ ready: await app.getUrl() });
})().catch(async () => {
  // Avoid sending configuration/credential-bearing stack traces to reports.
  process.send?.({ error: 'Compiled benchmark application failed to initialize' });
  try { if (app) await app.close(); } finally { process.exit(1); }
});
