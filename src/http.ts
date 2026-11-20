/**
 * Polite JSON fetching: an honest User-Agent, one request at a time per host with a gap, a timeout
 * that covers the body, 2 retries on 5xx/timeout/network errors, and a host stop on 429 or 403.
 * Messages name the host and path only, never the query string (it can hold an API key).
 */
export type HttpResult = { ok: true; data: unknown } | { ok: false; status?: number; reason: string };

export interface HttpClient {
  getJson(url: string, opts?: { timeoutMs?: number }): Promise<HttpResult>;
}

export interface HttpOptions {
  userAgent: string;
  gapMs?: (host: string) => number;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createHttp(o: HttpOptions): HttpClient {
  const fetchImpl = o.fetchImpl ?? fetch;
  const queues = new Map<string, Promise<void>>();
  const lastStart = new Map<string, number>();
  const stopped = new Map<string, string>();
  const retries = o.retries ?? 2;

  return {
    async getJson(url, opts) {
      const host = new URL(url).host;
      const previous = queues.get(host) ?? Promise.resolve();
      let release = (): void => undefined;
      const mine = new Promise<void>((resolve) => {
        release = resolve;
      });
      queues.set(host, previous.then(() => mine));
      await previous;
      try {
        const stop = stopped.get(host);
        if (stop) return { ok: false, reason: `host stopped after ${stop} earlier in this run` };
        for (let attempt = 0; ; attempt++) {
          const wait = (lastStart.get(host) ?? 0) + (o.gapMs?.(host) ?? 1000) - Date.now();
          if (wait > 0) await sleep(wait);
          lastStart.set(host, Date.now());
          try {
            const res = await fetchImpl(url, {
              headers: { 'user-agent': o.userAgent, accept: 'application/json' },
              signal: AbortSignal.timeout(opts?.timeoutMs ?? o.timeoutMs ?? 30_000),
            });
            if (res.status === 429 || res.status === 403) {
              stopped.set(host, `HTTP ${res.status}`);
              return { ok: false, status: res.status, reason: `HTTP ${res.status}; no more requests to this host in this run` };
            }
            if (res.status >= 500 && attempt < retries) {
              await sleep(2000 * 2 ** attempt);
              continue;
            }
            if (res.status !== 200) return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
            const text = await res.text();
            try {
              return { ok: true, data: JSON.parse(text) as unknown };
            } catch {
              return { ok: false, status: 200, reason: 'the answer was not JSON' };
            }
          } catch (err) {
            if (attempt < retries) {
              await sleep(2000 * 2 ** attempt);
              continue;
            }
            const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
            return { ok: false, reason: timeout ? 'timeout' : 'network error' };
          }
        }
      } finally {
        release();
      }
    },
  };
}
