# worker/friction/

The core model, pure and exhaustively tested.

## How it works

`friction.ts`: `frictionOf(facts, persona)` → score and reasons; frustration accumulation/decay. `decide.ts`: continue/retry/skip/abandon with the exact rule text. `money.ts`: convert/defer/churn from perceived value versus the price read from the target. See docs/FRICTION_MODEL.md.
