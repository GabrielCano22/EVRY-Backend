// Dedicated compiled application process; no testing-module guard overrides.
function phase(name) {
  // Opt-in only: other consumers still receive readiness as their first message.
  if (process.env.EVRY_BENCHMARK_STARTUP_TRACE === 'true') process.send?.({ phase: name });
}
phase('IMPORTS_STARTED');
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');
phase('IMPORTS_READY');

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
  phase('APP_CREATED');
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  phase('LISTENING');
  process.send({ ready: await app.getUrl() });
})().catch(async () => {
  // Avoid sending configuration/credential-bearing stack traces to reports.
  process.send?.({ error: 'Compiled benchmark application failed to initialize' });
  try { if (app) await app.close(); } finally { process.exit(1); }
});
