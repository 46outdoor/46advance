# Font licenses — what each face is allowed to do

The app self-hosts two typefaces in `public/fonts/`, with very different terms. This file is the
check before putting either anywhere new. (**Nexa was removed 2026-08-01** — it had shipped on the
mistaken belief the org owned a license; it never did. Poppins below fills its role.)

## Hikou — Tugcu Design LLC Desktop License (purchased 2026-08-01)

License on file with the owner (Tugcu Design LLC EULA; contact mehmetugcu@gmail.com). The face is
**ALL-CAPS** — its "lowercase" glyphs are the capitals verbatim (verified from the outlines) — so
it is the **display voice only**: `--font-display` headings and the `--font-accent` mark, never
body text. The repo keeps the four text faces (Light/Regular ± oblique); the decorative variants
(Outline, Urban, Rough, …) stay in the owner's purchase download, unshipped.

| Use | Allowed? | Notes |
| --- | --- | --- |
| Webfont on the PWA | **Yes** | Webfont clause, up to 500k views/month — far above this app's traffic. |
| Embedding in generated PDFs (packets/quotes) | **Only if** the font is **not extractable** and the document is not for sale | `@react-pdf/renderer` embeds extractable subsets, so wiring Hikou into the packet renderer would sit on the wrong side of this clause. The renderer deliberately uses **Helvetica** — change that only with a licensing answer in hand. |
| Bundling in the native mobile app | **No** | "May not embed the fonts in apps" is explicit. **Decided 2026-08-03: the native app uses Poppins for all type, headings included** — no Hikou tier will be purchased. Do not copy Hikou files into the Expo bundle. |
| Redistribution | **No** | The files live in this (private) repo and are served as webfonts — both fine. Making the repo public, or shipping the files anywhere users can take them *as fonts*, is redistribution. |
| Desktop installs | 3 computers, the licensed user only | Design work on the owner's machines. |

## Poppins — SIL Open Font License (body text)

`--font-sans` — all body/UI text, self-hosted woff2 per weight actually used (400/500/600/700/900,
latin subset, fetched from Google Fonts). The OFL permits web serving, PDF embedding, app bundling,
and redistribution; the only real obligations are not selling the fonts by themselves and leaving
their names/notices intact. **No restrictions relevant to any current or planned use** — including
the native app and packet PDFs, where Poppins is the licensed-safe option if brand type is ever
wanted there.

## The rule of thumb

Poppins can go anywhere. Hikou goes only where the PWA shows headings. Anything beyond that —
PDFs, the native app, files that leave the org — gets checked against this file first, and this
file gets updated when a license is bought or a term is clarified.
