export function summarizeLatencies(values: readonly number[], budgetMs: number) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Observations must be nonempty, finite and nonnegative.');
  }
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error('Budget must be positive and finite.');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1];
  // For continuous IID observations: P(q95 <= X_(r)) = P(Bin(n,.95) <= r-1).
  // With ties the bound is conservative. Compute PMFs in log space, avoiding
  // underflow of the starting .05^n recurrence for larger sample counts.
  let cumulative = 0;
  let logChoose = 0;
  let upper: number | null = null;
  let coverage: number | null = null;
  for (let k = 0; k < sorted.length; k++) {
    if (k) logChoose += Math.log(sorted.length - k + 1) - Math.log(k);
    cumulative += Math.exp(logChoose + k * Math.log(.95) + (sorted.length - k) * Math.log(.05));
    if (cumulative >= .95) {
      upper = sorted[k];
      coverage = Math.min(cumulative, 1);
      break;
    }
  }
  return {
    samples: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95),
    p99Ms: percentile(.99), maxMs: sorted.at(-1)!, budgetMs,
    p95Upper95Ms: upper, confidenceCoverage: coverage,
    acceptedWith95Confidence: upper !== null && upper < budgetMs,
  };
}

export async function measureScenario(options: ScenarioOptions) {
  const origin = new URL(options.baseUrl);
  if (origin.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(origin.hostname)
    || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('Benchmark requires an HTTP loopback origin without credentials, path or query.');
  }
  if (!options.path.startsWith('/') || options.path.startsWith('//') || options.path.includes('\\')
    || [...options.path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error('Benchmark requires a relative path beginning with a single slash.');
  }
  if (![options.samples, options.warmup, options.concurrency].every(Number.isInteger)
    || options.samples < 1 || options.warmup < 0 || options.concurrency < 1) {
    throw new Error('Benchmark request counts must be valid integers.');
  }
  if (!Number.isFinite(options.budgetMs) || options.budgetMs <= 0) throw new Error('Budget must be positive and finite.');
  const url = new URL(options.path, origin);
  if (url.origin !== origin.origin) throw new Error('Benchmark relative path must remain on the loopback origin.');
  if (options.deadline !== undefined && !Number.isFinite(options.deadline)) throw new Error('Benchmark deadline must be finite.');
  const observationsMs: number[] = [];

  async function run(count: number, record: boolean) {
    let next = 0;
    let failed = false;
    const jobs = Array.from({ length: Math.min(options.concurrency, count) }, async () => {
      while (!failed && next++ < count) {
        try {
          const remaining = options.deadline === undefined ? 10_000 : options.deadline - performance.now();
          if (remaining <= 0) throw new Error('Benchmark overall deadline exhausted');
          const started = performance.now();
          const response = await fetch(url, {
            method: options.method ?? 'GET', redirect: 'manual',
            signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(10_000, remaining)))),
            headers: {
              ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
              ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          });
          if (response.status !== (options.status ?? 200)) {
            await response.body?.cancel();
            throw new Error(`Benchmark HTTP status ${response.status}`);
          }
          const value: unknown = await response.json();
          const elapsed = performance.now() - started;
          options.validate(value);
          if (record) observationsMs.push(elapsed);
        } catch (error) { failed = true; throw error; }
      }
    });
    // Drain in-flight workers before rejecting; do not silently discard errors
    // or leave outstanding mutations when the fixture/application closes.
    const results = await Promise.allSettled(jobs);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
  await run(options.warmup, false);
  await run(options.samples, true);
  return { ...summarizeLatencies(observationsMs, options.budgetMs),
    warmup: options.warmup, concurrency: options.concurrency, observationsMs };
}

export interface ScenarioOptions {
  baseUrl: string;
  path: string;
  samples: number;
  warmup: number;
  concurrency: number;
  budgetMs: number;
  deadline?: number;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  token?: string;
  status?: number;
  validate: (value: unknown) => void;
}
