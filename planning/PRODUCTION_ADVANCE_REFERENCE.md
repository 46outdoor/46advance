# Production Advance — Reference (the artist-facing festival packet)

**Source:** *RTC (Rock The Country) 2026 Production Advance — Sioux Falls* (the branded
PDF 46 sends to artists). Captured 2026-06-23. This is the **festival production record**
(ROADMAP §5b) **and** the model for the **PDF packet output** (§7) — "we just need an
expanded version of this, with all technical details fully fleshed out" (user).

> Key structural finding: the packet has **two levels** — **event-level** general/policy
> info **and** **per-stage** technical production (MAIN STAGE vs RAISED ROWDY STAGE differ).
> This supersedes the earlier "event-level only" decision (re-confirm).

> **Audience caveat (internal/tech-facing app):** this packet is *artist-facing*; our app
> is for the **crew/techs** (memory `audience-internal-tech`). Borrow the **styling**, but
> our content is **tech-operational** — the artist-policy blurbs below (hospitality riders,
> comp tickets/guest passes, artist settlement, merch sales) are **out of scope** or belong
> only to an Artist Relations section, not the tech production record.

## Cover / design idiom
Branded cover: dark concert photo + bold **red diagonal slash** (silver edges) + 46 logo +
event (RTC) logo; section dividers; clean white content pages with the 46 footer mark.
Matches ROADMAP §UI / §7 — our PDF report theme should reproduce this.

## A. Event-level (festival-wide) — mostly standard, templated text
- **Production contacts** (name · phone · email): Production Director · Production Advance
  (Main + Side) · Artist Relations / Backstage Advance · Audio Lead / Audio Advance ·
  Lighting Advance · Director of Security. *(ties to Contacts §11; embedded here.)*
- **Event identity:** city · venue · address · dates. *(= our Event fields; the packet
  lists the whole tour — each stop is one event in our model.)*
- **Policy / info blurbs (standard festival package — great template defaults):** Arrival ·
  Artist Relations Office · Festival Artist Credentials · Merchandise · Catering ·
  Hospitality · Toilets & Showers · Runners · Guest Passes / Tickets · Parking · Artist
  Settlement · Pyrotechnics / SFX. *(mostly longtext; nearly identical across stops.)*
- **Production / CAD files link** (e.g. a Drive/bit.ly URL to plots + CAD).

## B. Per-stage technical production (one block per stage)
Each stage (MAIN STAGE, RAISED ROWDY STAGE, …) carries its own:
- **Staging:** builder/model (Stageline SAM 575 / SL250) · main deck dims · thrust +
  landing · covered wings · wing extensions · crossover · loading dock/ramp · FOH deck +
  cover · scissor lift (robo spots) · camera risers · delay towers · side-hang towers.
  *(Day-of rigging advanced with the PM.)*
- **Audio:** main speakers (PA — model · qty · flown/ground/config) · FOH drive/control ·
  FOH console (+ stage boxes) · MON console · MON package (wedges/IEM) · mics & accessories
  (festival mic/DI package, IEM packs, wireless HH, stands) · stage power · intercom
  (Clear-Com) · shout system · **festival audio staff** (system tech, audio techs counts).
- **Lighting:** fixtures (model · qty) · follow spots · hazers · console (GrandMA3) ·
  **plot attached / CAD link** · lighting-advance contact.
- **LED:** wall product · qty · size/orientation.
- **Video control:** switcher · router · cameras · lenses.

## C. Attachments / drawings (new capability)
The packet references **CAD/production files via an external link** *and* an **attached
lighting/stage plot** ("Plot Attached"). The production record needs to **attach files
(stage plots, site maps, CAD)** and/or **store external links** — a new capability
(Firebase Storage uploads + link fields). Also relevant to per-artist advances (stage
plot / input list documents, §audio reference).

## Mapping → our model
| Packet element | Where it lives | Status |
| --- | --- | --- |
| Production contacts | Contacts (§11) + production record (event-level) | 🆕 contacts not built |
| Event identity (venue/address/dates) | Event fields | ✅/➕ (add address) |
| Policy/info blurbs | **Event-level** production record (longtext fields) | 🆕 |
| Production/CAD link + attached plots | **Attachments/links** on production record (+ advances) | 🆕 capability |
| Staging specs | **Stage-level** production record — needs a **Staging** dept/section | 🆕 (new dept) |
| Audio / Lighting / LED / Video house package | **Stage-level** production record (department-keyed) | 🆕 |
| Festival staff counts (system tech, audio techs) | Stage-level production (Labor-ish) | 🆕 |

## New decisions surfaced (2026-06-23)
1. **Two levels** — event-level (general/policy/contacts) **and** per-stage technical
   production. (Supersedes "event-level only".)
2. **New "Staging" department** (the packet separates Staging from Audio/Lighting/Video).
   Our departments would become: Audio · Lighting · Video/LED · **Staging** · Logistics ·
   Labor · Artist Relations.
3. **Attachments/links** (stage plots, CAD, site maps) on the production record (and
   advances) — Firebase Storage uploads + external-link fields.
4. **Production = the PDF packet source** — fields here drive the §7 packet output.
   Field values are mostly the **standard package** → strong template (§6) defaults.
