/**
 * Target readiness before a browser run: each URL must answer (any HTTP status) within a shared
 * budget. A dev server that is still compiling holds requests or refuses connections; running
 * personas against it would only measure the build. Returns the first URL that never answered.
 */
export async function waitReady(
  urls: string[],
  o: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    pollMs: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<string | null> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + o.timeoutMs;
  for (const url of urls) {
    for (;;) {
      const left = deadline - now();
      if (left <= 0) return url;
      if (await answers(url, o.fetchImpl, Math.min(left, 10_000))) break;
      await sleep(Math.min(o.pollMs, Math.max(0, deadline - now())));
    }
  }
  return null;
}

async function answers(url: string, fetchImpl: typeof fetch, ms: number): Promise<boolean> {
  try {
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(ms) });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}
