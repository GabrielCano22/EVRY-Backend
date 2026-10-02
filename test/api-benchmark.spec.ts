import { createServer, type Server } from 'node:http';
import { measureScenario, summarizeLatencies } from './helpers/api-benchmark';

describe('benchmark statistical evidence', () => {
  it('keeps nearest-rank tail spikes and does not mutate observations', () => {
    const values = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(summarizeLatencies(values, 100)).toMatchObject({
      samples: 100, p50Ms: 50, p95Ms: 95, p99Ms: 99, maxMs: 100,
      p95Upper95Ms: 99, acceptedWith95Confidence: true,
    });
    expect(values[0]).toBe(100);
  });

  it('cannot certify p95 with fewer than 59 observations', () => {
    expect(summarizeLatencies(Array(58).fill(1), 300)).toMatchObject({
      p95Upper95Ms: null, acceptedWith95Confidence: false,
    });
    expect(summarizeLatencies(Array(59).fill(1), 300)).toMatchObject({
      p95Upper95Ms: 1, acceptedWith95Confidence: true,
    });
  });

  it('rejects a budget when its confidence bound equals the strict threshold', () => {
    expect(summarizeLatencies(Array(100).fill(300), 300)).toMatchObject({
      p95Upper95Ms: 300, acceptedWith95Confidence: false,
    });
  });

  it.each([[], [-1], [NaN], [Infinity]].map((values) => ({ values })))('rejects invalid or empty observations $values', ({ values }) => {
    expect(() => summarizeLatencies(values, 300)).toThrow(/observations/i);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid budget %s', (budget) => {
    expect(() => summarizeLatencies([1], budget)).toThrow(/budget/i);
  });
});

describe('benchmark HTTP boundary (real loopback server)', () => {
  let server: Server;
  let baseUrl: string;
  let calls: number;
  let active: number;
  let peak: number;

  beforeEach(async () => {
    calls = active = peak = 0;
    server = createServer((req, res) => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      setTimeout(() => {
        active--;
        if (req.url === '/redirect') {
          res.writeHead(302, { location: 'https://example.com/' });
          res.end();
        } else if (req.url === '/error') {
          res.writeHead(503); res.end('{"unavailable":true}');
        } else if (req.url === '/invalid') {
          res.writeHead(200); res.end('not JSON');
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          // Split the response: returning at headers rather than consuming
          // the complete body must not validate this payload successfully.
          res.write('{"value":');
          setTimeout(() => res.end('42}'), 5);
        }
      }, 10);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing local server');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  function options(path = '/') {
    return { baseUrl, path, samples: 6, warmup: 2, concurrency: 3, budgetMs: 500,
      validate: (value: unknown) => expect(value).toEqual({ value: 42 }) };
  }

  it('excludes warming requests, consumes bodies and actually runs concurrent requests', async () => {
    const result = await measureScenario(options());
    expect(result).toMatchObject({ samples: 6, warmup: 2, concurrency: 3,
      observationsMs: expect.arrayContaining([expect.any(Number)]) });
    expect(calls).toBe(8);
    expect(peak).toBe(3);
  });

  it.each(['/redirect', '/error'])('invalidates the run rather than discarding HTTP failure %s', async (path) => {
    await expect(measureScenario(options(path))).rejects.toThrow(/HTTP status (302|503)/);
  });

  it('invalidates a body that cannot be parsed as JSON', async () => {
    // fetch's parser belongs to a different VM realm under Jest ESM.
    await expect(measureScenario(options('/invalid'))).rejects.toThrow(/not JSON.*not valid JSON/);
  });

  it('invalidates a response containing incorrect application data', async () => {
    await expect(measureScenario({ ...options(), validate: () => { throw new Error('Wrong dataset'); } })).rejects.toThrow('Wrong dataset');
  });

  it.each(['https://example.com', 'http://example.com', 'http://user@127.0.0.1', 'http://127.0.0.1?host=remote', 'http://127.0.0.1/path'])('rejects unsafe server origin %s before connecting', async (url) => {
    await expect(measureScenario({ ...options(), baseUrl: url })).rejects.toThrow(/loopback origin/i);
    expect(calls).toBe(0);
  });

  it.each(['https://example.com', '//example.com', '/\\example.com', 'relative'])('rejects path override %s', async (path) => {
    await expect(measureScenario(options(path))).rejects.toThrow(/relative path/i);
    expect(calls).toBe(0);
  });

  it.each(['\t', '\r', '\n'])('rejects URL normalization origin escape via control character %j', async (control) => {
    await expect(measureScenario({ ...options(`/${control}/127.0.0.1:9/`), token: 'synthetic-not-a-real-token' })).rejects.toThrow(/relative path/i);
    expect(calls).toBe(0);
  });

  it('rejects an exhausted overall deadline before starting requests', async () => {
    await expect(measureScenario({ ...options(), deadline: performance.now() - 1 })).rejects.toThrow(/deadline/i);
    expect(calls).toBe(0);
  });

  it.each([{ samples: 0 }, { samples: 1.5 }, { warmup: -1 }, { concurrency: 0 }, { concurrency: 1.5 }])('rejects invalid request counts %j', async (override) => {
    await expect(measureScenario({ ...options(), ...override })).rejects.toThrow(/counts/i);
    expect(calls).toBe(0);
  });
});
