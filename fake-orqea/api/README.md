# fake-orqea/api/

The fake's JSON API.

## How it works

Same paths, payloads and errors as Orqea's `backend/src/routes/api` (ids are integers, errors `{message, issues?}` or `{code, field}`). `auth.ts` (register/verify/login with Orqea's validation rules, captcha and login brake exemptions for signed synthetic runs), `boards.ts` (boards, lists, cards, priorities on cards, checklist items, comments), `board-extras.ts` (priorities, bulk plan, rules, members, labels, forms), `personal.ts` (profile, preferences, onboarding checklist, export, account deletion, notes, calendar, search, statistics, QR codes, public form submission, billing), `helpers.ts` (auth, ownership, JSON shapes), `descriptor.ts` (nested `GET /api`), `plans.ts` (Orqea's plan catalogue with the readable fields; Enterprise is quote-based), `admin.ts` (synthetic admin API: target, verification link to the web page, cleanup with per-table counts, scenario control — local sources and shared secret only, invisible in production).
