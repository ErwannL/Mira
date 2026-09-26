# Orqea UI facts (catalogue cat-2.0.0)

The catalogue's `ui` steps use the roles and accessible names of the real Orqea web app, read from
its source (`frontend/src/pages`, `components`, `locales/{en,fr}.json`, September 2026). Where Orqea
gives a control no usable accessible name, the step keeps the name a user would expect and **fails
as a persona would**; Figura never falls back to a CSS selector. These are known friction facts, not
Figura bugs. The fake Orqea reproduces the ones marked _(fake)_ so its runs show them too.

**Verification status.** Names were taken from source and locales; they have not yet been replayed
against a running Orqea (no Orqea stack was up while the catalogue was written). The first run
against the local stack will confirm them: a `no <role> named "…"` step error on a use case not
listed here is a catalogue fix to make, not an Orqea defect.

## Controls without a usable accessible name

| Use case                     | Control                        | Fact                                                                                                                                                                 |
| ---------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| edit-card                    | Description editor             | Rich-text editor (`RichTextEditor`, react-quill): `aria-label="Description"` sits on the wrapper, the editable element has no textbox role or name _(fake)_.         |
| comment, mention             | Comment editor                 | Same editor, `aria-label="Add a comment"` on the wrapper _(fake)_. The submit button **is** named ("Add a comment").                                                 |
| settings-language            | "Preferred language"           | Custom dropdown (`LanguageDropdown`); the label text is not tied to any control _(fake)_.                                                                            |
| create-card                  | New card title                 | Placeholder "Title" only, no label (a placeholder is an accessible-name fallback, so it works, but it disappears as soon as the user types).                         |
| create-card, bulk-actions, … | Card buttons / selection boxes | `aria-label="Ouvrir la tâche …"` / `"Sélectionner la tâche …"` are **hard-coded French** in every language (`TaskCard.jsx`) _(fake)_. Steps match on the card title. |

## Outcomes without a role or name

| Use case                  | Fact                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| signup                    | The success message is a plain paragraph; the "mail not delivered" one (what a synthetic account gets) is `role="status"`. Checked with `expectText` "Account created".                                           |
| signup                    | Validation messages are not `role="alert"`: Figura sees a refused signup as a missing outcome, not as an announced error.                                                                                         |
| create-list, checklist, … | New lists, checklist items, rules and notes appear as text only (`expectText`).                                                                                                                                   |
| onboarding                | Hiding the "Getting started" checklist leaves nothing new to see (only an absence): the step ends on the click, once the network has settled.                                                                     |
| stats                     | `/stats` is gated in the browser (`RequireFeature`): a lock screen, **no 402 on the wire**. The browser driver cannot tell this paywall from a failure; the API path (`GET /api/me/analytics/summary` → 402) can. |

## Flows a persona cannot finish in the browser

| Use case           | Fact                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| signup (local)     | The local stack builds the SPA with `REACT_APP_ALLOWED_EMAIL_DOMAINS=gmail.com`: the form's own domain check blocks `synth+…@synthetic.invalid` before any request. Orqea's side must allow `synthetic.invalid` there in synthetic mode. |
| card-priority      | A new board has no priority levels: the Priority select offers nothing to pick _(fake)_.                                                                                                                                                 |
| move-card          | Drag and drop is dnd-kit (pointer events); keyboard personas are blocked by design of the step. The drop target (list heading "done") is not verified.                                                                                   |
| form-answer-public | The public form's link is only copied to the clipboard (no link to open): the journey needs `formToken`, which only the API path captures.                                                                                               |
| billing-checkout   | Ends on Stripe's hosted page (external); the step stops at the "Choose <plan>" click.                                                                                                                                                    |

## API facts

- `POST /api/auth/register` does not enforce `acceptedTerms` (only the web form does): the
  `forgetTerms` mistake has no effect through the API.
- Without `username`, Orqea derives it from the email's local part and refuses `synth+…` (`+`);
  Figura always sends `username` (`s<runId>_<personaId>`, ≤ 30 characters).
- Errors are `{message, issues?}` (auth and most routes) or `{code, field}` (rules, forms, QR).
  "Weak password" alone is short; Figura judges clarity on the message **and** its `issues`.
- `GET /api` is documentation, not a route dump: it does not describe `GET /api/auth/verify-email`,
  priorities, notes, forms, onboarding, export or account deletion. Drift is therefore reported in
  the run summary, never fatal.
