process.on('SIGTERM', () => {});
process.on('message', (message) => {
  if (message === 'close' && process.argv[2] === 'graceful') process.exit(0);
});
process.send({ ready: true });
