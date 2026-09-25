# brand/

Figura's identity: logo masters, generated PNG/ICO, Open Graph image and brand guide.

## How it works

`logo.svg` is the master (it carries its own dark tile, so one mark works on dark and light backgrounds). `logo-animated.svg` uses CSS only and is static under `prefers-reduced-motion`. `npm run brand` regenerates every PNG, `favicon.ico` and the UI copies from the SVGs. See the guide below.

## Name

**Figura** — Latin/Italian/French/English-readable for "figure": a persona, a figure on stage
rehearsing, a crowd of figures. Reads as **Figura by Orqea** / **Figura par Orqea**.

## Palette

| Hex       | Role                                                            | Contrast on `#0f1115` |
| --------- | --------------------------------------------------------------- | --------------------- |
| `#3dd6c6` | Primary (teal): mark, links, primary buttons                    | 10.5 : 1 (AA/AAA)     |
| `#0f1115` | Background (matches the admin console), text on primary buttons | —                     |
| `#171a21` | Surfaces (header, inputs)                                       | —                     |
| `#2a2f3a` | Lines, borders                                                  | —                     |
| `#e6e8ee` | Text                                                            | 15.4 : 1              |
| `#9aa3b2` | Muted text                                                      | 7.4 : 1               |
| `#ff7b72` | Errors, refusals                                                | 7.5 : 1               |

No violet, no gradients, no glow.

## Typography

System UI stack (`system-ui, -apple-system, 'Segoe UI', sans-serif`) — no web font to load
inside the console. Name set in bold; "by Orqea" in muted regular at ~0.85×.

## Clear space and minimum size

Keep a clear space of 1/4 of the mark's width on every side. Minimum size: 16 px (favicon); below
24 px use `logo-16.png`/`logo-32.png` (rendered from the same master).

## Files

`logo.svg` (master), `logo-animated.svg` (CSS animation, 2.4 s cycle, static under
`prefers-reduced-motion: reduce`), `logo-{16,32,180,192,512,1024}.png`, `og-image.svg/.png`
(1200×630), `favicon.ico`. Regenerate everything with `npm run brand`.
