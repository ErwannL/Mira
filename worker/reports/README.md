# worker/reports/

Deterministic report builders.

## How it works

`funnel.ts` (use-case funnel, headline funnel, coverage matrix), `compare.ts` (A/B), `load.ts` (usage forecast and measured latency), `pricing.ts` (replays money decisions under price scenarios), `calibration.ts` (vs real aggregates, suggestions only), `html.ts` (self-contained HTML, EN/FR), `meta.ts` (seed, versions, disclaimer).

## Sub-folders

- `golden/` — Golden JSON of the funnel report for a fixed seed.
