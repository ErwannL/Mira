/** Deterministic statistics helpers (sorted copies, no mutation). */
export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return round4(
    (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo),
  );
}

export const median = (values: number[]): number | null => quantile(values, 0.5);

export function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function countBy<T>(items: T[], keyOf: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    const k = keyOf(i);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Top-N keys by count, ties broken alphabetically for determinism. */
export function top(counts: Record<string, number>, n: number): { key: string; count: number }[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}
