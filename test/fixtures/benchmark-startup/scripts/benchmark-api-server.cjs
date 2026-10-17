// A real IPC child for startup-boundary tests. Never opens a database or server.
const mode = new URL(process.env.DATABASE_URL).pathname.slice(1);
process.on('message', (message) => { if (message === 'close') process.exit(0); });
process.on('disconnect', () => process.exit(0));
process.send({ phase: 'UNTRUSTED_SYNTHETIC_PRIVATE', token: 'SYNTHETIC_PRIVATE' });
process.send({ phase: 'IMPORTS_STARTED', elapsedMs: -100, token: 'SYNTHETIC_PRIVATE' });
process.send({ phase: 'IMPORTS_STARTED', token: 'SYNTHETIC_PRIVATE duplicate' });
if (mode === 'ready') {
  process.send({ phase: 'IMPORTS_READY' });
  process.send({ phase: 'APP_CREATED' });
  process.send({ phase: 'LISTENING' });
  process.send({ ready: 'http://127.0.0.1:4000' });
} else if (mode === 'reject') {
  process.send({ error: 'SYNTHETIC_PRIVATE initialization stack and credential' });
} else if (mode === 'exit') {
  setImmediate(() => process.exit(7));
}
