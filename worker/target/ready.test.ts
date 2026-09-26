import { describe, expect, it } from 'vitest';
import { waitReady } from './ready.js';

/** A fetch that fails `n` times for a URL, then answers (any status counts as an answer). */
function flaky(fails: Record<string, number>, calls: string[] = []) {
  return (async (url: string) => {
    calls.push(url);
    if ((fails[url] ?? 0) > 0) {
      fails[url]! -= 1;
      throw new Error('ECONNREFUSED');
    }
    return new Response('starting…', { status: 503 });
  }) as typeof fetch;
}

describe('waitReady', () => {
  it('ready when every URL answers, whatever the status, polling the ones that do not yet', async () => {
    const calls: string[] = [];
    const slept: number[] = [];
    let t = 0;
    const r = await waitReady(['http://web', 'http://api'], {
      fetchImpl: flaky({ 'http://web': 2 }, calls),
      timeoutMs: 10_000,
      pollMs: 2000,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms);
        t += ms;
      },
    });
    expect(r).toBeNull();
    expect(calls).toEqual(['http://web', 'http://web', 'http://web', 'http://api']);
    expect(slept).toEqual([2000, 2000]);
  });

  it('returns the first URL that never answered within the budget', async () => {
    let t = 0;
    const slept: number[] = [];
    const r = await waitReady(['http://web', 'http://api'], {
      fetchImpl: flaky({ 'http://web': 99 }),
      timeoutMs: 5000,
      pollMs: 2000,
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms);
        t += ms;
      },
    });
    expect(r).toBe('http://web');
    expect(slept).toEqual([2000, 2000, 1000]);
  });

  it('a request that hangs (dev server compiling) is cut at the budget, with real timers', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch;
    const t0 = Date.now();
    expect(
      await waitReady(['http://web'], { fetchImpl: hanging, timeoutMs: 150, pollMs: 50 }),
    ).toBe('http://web');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
    const bodiless = (async () => ({ body: null }) as Response) as typeof fetch;
    expect(
      await waitReady(['http://x'], { fetchImpl: bodiless, timeoutMs: 100, pollMs: 10 }),
    ).toBeNull();
  });
});
