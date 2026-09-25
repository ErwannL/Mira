# Personas

Data files in `personas/<id>.json`, validated by `shared/persona-schema.ts`; one test each
(`personas/<id>.test.ts`) pins traits and at least one behaviour.

| #   | id                 | Who                                                            | Device / lang | Weight | Pinned behaviour                                            |
| --- | ------------------ | -------------------------------------------------------------- | ------------- | ------ | ----------------------------------------------------------- |
| 1   | retired-volunteer  | Retired association volunteer, shared to-do                    | mobile / fr   | 8 %    | abandons a signup with > 5 visible fields; never pays       |
| 2   | student            | Student group project, team of 4, budget ≤ 3 €                 | mobile / en   | 16 %   | does not pay for paid features; tolerates the cookie banner |
| 3   | freelance-designer | Client boards, forms, QR codes, 15 €                           | laptop / fr   | 10 %   | converts for QR codes                                       |
| 4   | business-owner     | Bakery, team of 8, calendar & reminders, 30 €                  | desktop / fr  | 12 %   | leaves on slow pages with extra clicks                      |
| 5   | project-manager    | SME PM, team of 15, tutorial, automation, 80 €                 | desktop / en  | 14 %   | reads long pages; buys automation                           |
| 6   | junior-developer   | Hates long text; wants Git/CI views (not yet in the catalogue) | laptop / en   | 13 %   | abandons dense, wordy, unclear steps                        |
| 7   | tech-lead          | Keyboard-first power user, high value threshold                | desktop / en  | 7 %    | tolerates dense UIs; no conversion without value            |
| 8   | teacher            | Forms for pupils, guests without accounts, privacy-first       | laptop / fr   | 10 %   | put off by privacy prompts + extra fields + captcha         |
| 9   | agency             | 20 seats, templates, duplication, 150 €                        | desktop / en  | 6 %    | converts for bulk actions                                   |
| 10  | screen-reader-user | Screen reader + keyboard only                                  | desktop / en  | 4 %    | abandons when a needed control has no accessible name       |

## Adding persona #11

1. Create `personas/<id>.json` (the id must match the file name; `goalFeatures` must be catalogue
   ids; `populationWeight` is relative — weights are normalised at load).
2. Create `personas/<id>.test.ts` pinning its traits and one behaviour (see existing ones).
   Nothing else changes.

## Memory (per run and persona)

Stage, sessions, frustration history, pages seen, use cases attempted/succeeded/skipped, errors
met, money decisions, learned features (less friction next time), non-secret variables (board
name, ids). Credentials are stored encrypted; session tokens are never stored.
