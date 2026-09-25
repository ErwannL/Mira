# e2e/

End-to-end tests (`npm run e2e`, after `npm run build`).

## How it works

`console-sso.e2e.ts` opens the fake admin console in Chromium, which embeds the built UI in an iframe with a fresh SSO token, and checks sign-in, fragment removal, token reuse and the no-session gate.
