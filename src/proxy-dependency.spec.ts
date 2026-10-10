import express from 'express';
import request from 'supertest';

// Characterize the actual Express dependency: a reverted lock must not silently
// turn malformed IPv6 trust ranges into trust for every IPv4 sender.
describe('proxy dependency trust boundary', () => {
  const forwarded = '203.0.113.19';

  function fixture(trust?: string) {
    const app = express();
    if (trust) app.set('trust proxy', trust);
    app.get('/ip', (req, res) => res.json({ ip: req.ip, remote: req.socket.remoteAddress }));
    return app;
  }

  it.each(['::ffff:127.0.0.1/8', '::/1'])(
    'does not accept a forged IPv4 hop under malformed trust subnet %s',
    async trust => {
      const response = await request(fixture(trust)).get('/ip').set('X-Forwarded-For', forwarded).expect(200);
      expect(response.body.ip).not.toBe(forwarded);
      expect(response.body.ip).toBe(response.body.remote);
    },
  );

  it('preserves correctly mapped IPv4 trust prefixes', async () => {
    const response = await request(fixture('::ffff:127.0.0.0/104')).get('/ip').set('X-Forwarded-For', forwarded).expect(200);
    expect(response.body.ip).toBe(forwarded);
  });

  it('preserves the default refusal to trust forwarded headers', async () => {
    const response = await request(fixture()).get('/ip').set('X-Forwarded-For', forwarded).expect(200);
    expect(response.body.ip).not.toBe(forwarded);
    expect(response.body.ip).toBe(response.body.remote);
  });
});
