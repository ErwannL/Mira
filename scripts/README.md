# scripts/

Tooling scripts (not product code).

## How it works

`check-*.mjs` are the repository gates (file length ≤ 1000, LF, READMEs, no skipped tests or coverage tricks, secret scan). `brand.mjs` regenerates brand PNGs. `mint-sso.mjs` prints a URL with a valid 60 s SSO token from `.env` (local use without the console; optional second argument = the `target` claim). `drift.mjs` checks the catalogue against a target's `GET /api` (nested descriptor walked; `--strict` fails on drift). `install-hooks.mjs` installs the pre-commit hook (`npm run check`).
