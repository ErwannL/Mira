# fake-orqea/api/

The fake's JSON API.

## How it works

`auth.ts` (register/verify/login with captcha and login brake exemptions for signed synthetic runs), `product.ts` (boards, lists, cards, forms, notes, QR, search, settings, export, billing; 402 paywalls), `plans.ts` (readable plan list), `admin.ts` (synthetic admin API: target, verification, cleanup, scenario control — local sources and shared secret only, invisible in production).
