# worker/engine/

The journey engine.

## How it works

`simulate.ts` walks simulated rounds and asks each persona whether it is active (`scheduler.ts`: active hours × activity × hour multipliers × seeded PRNG). `journey.ts` lives one session: `planner.ts` orders goals with prerequisites (+ curiosity), each use case is attempted through a driver, facts become friction, frustration accumulates, `decide()` chooses continue/retry/skip/abandon, paywalls go through the money model. `mistakes.ts` injects input errors that must be recovered through the page's messages.
