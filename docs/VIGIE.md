# Vigie service API

[Vigie](https://github.com/ErwannL/Vigie) (its `docs/CONTRACT.md` §4) drives Figura service to
service: it replays an incident's navigation path and pushes personas mined from real aggregates.

## Access

- `Authorization: Bearer <FIGURA_VIGIE_SECRET>` on every `/api/vigie/*` route, compared in constant
  time. Secret absent or shorter than 32 characters ⇒ every route answers **401**. It must differ from
  `FIGURA_SESSION_SECRET` and `FIGURA_SSO_SECRET` (the app refuses to start otherwise).
- Vigie calls `http://figura-app:4000` over the docker network. The loopback lock (404 for a non-local
  `Host`) has **one** exception: `/api/vigie/*` with a valid Bearer. Anything else from the network,
  including `/api/vigie/*` without the Bearer, stays 404. The Bearer never opens a session route.

## `POST /api/vigie/replays` → `202 {runId}`

Body: Vigie's Scenario (schema 1). `targetEnv` names a `FIGURA_TARGETS` entry; Vigie's `dev` is
the `local` target. `prod`/`production`/`live` ⇒ `409 {error: "PRODUCTION_ENV"}`; a name not
configured (or without a web URL: a replay drives the web app) ⇒ `409 {error: "TARGET_NOT_CONFIGURED"}`;
malformed ⇒ `400 {error: "INVALID_SCENARIO", issues}`. The worker's guard still runs (what the target
reports as its env, remote hosts, synthetic mode) and refuses as for any run.

The run (`kind: "replay"`) is one persona built from `persona` traits, in a browser, step by step:

| Vigie action  | Figura does                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signup`      | the catalogue's `signup` (timed); verification happens untimed when a later step needs an account                                                                                                                                 |
| `login`       | account set up untimed (signup, verification), then the catalogue's `login` (timed)                                                                                                                                               |
| `visit`       | opens the page template; signs in first unless public (`/`, `/login`, `/signup`…). `:boardId`/`:cardId` are created untimed (create-board/create-card) and read from where the browser lands; any other `:param` ⇒ not replayable |
| `use_feature` | the catalogue use case (Vigie feature key mapped by `FEATURE_TO_USE_CASE` in `shared/vigie.ts`, or a use-case id), prerequisites untimed                                                                                          |
| `wait`        | waits `target` ms (default 1 000, max 10 000)                                                                                                                                                                                     |
| `click`       | **not replayed**: its target is a `data-vigie` id and Figura drives roles and accessible names only                                                                                                                               |

## `GET /api/vigie/replays/:runId` → `200 {state, evidence: {steps}}`

`state`: `queued` (draft/queued/preparing), `running` (running/reporting/cleaning), `reproduced`,
`not_reproduced`, `failed` (refused, failed, cancelled — with `error`: refusal code or error).
`404` for an unknown id or a run that is not a replay.

Each step: `{index, action, durationMs, status, ok, breached, error}` (`action`, `breached`, `error`
are additions to Vigie's `{index, durationMs, status, ok}`).

- `durationMs`: the persona's wall time for the step in the browser (screenshot excluded).
- `status`: the **worst** HTTP status the step saw: its page load and every API call it triggered
  (an SPA page answers 200 while its API call fails). `null` when none.
- A step **breaches** when it carries an `expect` and misses it: failed, slower than `maxDurationMs`,
  or `status` differs. `reproduced` ⇔ at least one step breached.
- A step Figura cannot replay (click, unknown feature, setup failure) is `ok: false, breached: false`;
  if it carried the expectation, the run is `failed` (`REPLAY_INCOMPLETE: step i: …`), never a verdict.
- `reportUrl` is not sent: a replay has no funnel report; the screenshots are in the run.

## Target down or still starting

- **Before the first step** of a replay (and of any browser run), the worker waits until the web app
  (the URL the rewrite serves) and the API answer, any HTTP status counting, polling every 2 s within
  `FIGURA_READY_TIMEOUT_MS` (default 120 000). A dev server still compiling holds or refuses requests.
  Timeout ⇒ the run is `failed` with `error: "TARGET_NOT_READY: <url> did not answer within <n> ms"`;
  no account was created.
- **A step that got no HTTP response at all** (navigation timeout, connection refused, DNS) is not
  evidence: the replay stops there and ends `failed` with `error: "TARGET_UNREACHABLE: step <i>: …"`,
  never `reproduced`/`not_reproduced`. `error` is at the top level of the status response, and Vigie
  keys off these two prefixes.
- Pages are opened until `DOMContentLoaded`, not `load`: a dev server's hot-reload socket delays
  `load`, and every later step waits for its own control anyway.

## `POST /api/vigie/personas` → `202 {accepted, setId}`

Body: Vigie's PersonaSet (schema 1). Same target rules (409) and `400 INVALID_PERSONA_SET`. Each
persona becomes a Figura persona `vigie-<name>` (validated by the persona schema, never a catalogue
id, so the 10 catalogue personas are never overwritten), stored in Postgres and usable by later runs
(`personaIds`, `/api/meta`). Vigie sends no set id: `setId` is a hash of the set's content, and a set
already stored returns its first answer unchanged (idempotent). A newer set reusing names replaces
those personas.

Mapping (everything else is a neutral default): `locale` fr* ⇒ fr else en; `device`
mobile/phone/tablet ⇒ mobile, laptop ⇒ laptop, else desktop; `plan` free ⇒ budget 10, team 1, price
sensitive, otherwise budget 60, team 5; `weights.features` (share > 0, by share) ⇒ `goalFeatures`
(always with `create-board`; unmapped keys dropped); `sessionLength.medianMinutes` ⇒
`sessionLengthMin`; mean of `dropOff.activation` ⇒ `frictionTolerance = 1 − mean` (0.1–0.9);
`sample.people` share of the set ⇒ `populationWeight`. Other funnels (`upgrade`) are not used.
