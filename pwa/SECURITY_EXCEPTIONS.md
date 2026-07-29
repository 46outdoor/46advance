# PWA Security Exceptions

Accepted `npm audit` advisories for `pwa/`. Each entry is non-exploitable in the
current architecture or requires a breaking upstream migration. The scheduled
dependency audit keeps these findings visible; review dates prevent permanent
exceptions.

## Accepted advisories

### React Router `<8.3.0` — RSC-mode CSRF bypass (GHSA-qwww-vcr4-c8h2)

- **Severity:** high
- **Affected scope:** The advisory applies only to React Router's unstable RSC
  APIs. This PWA is a client-rendered Vite SPA using `BrowserRouter`, `Routes`,
  and declarative links; it does not import or configure any RSC API.
- **Why accepted:** The first patched release is React Router 8.3.0, a major
  migration. Downgrading outside the declared range, as suggested by npm's
  forced fix, would not address the intended long-term upgrade path. The
  vulnerable feature is not enabled here.
- **Removal trigger:** Upgrade `react-router-dom` to a patched 8.x release after
  reviewing its migration guide, then remove this entry.
- **Accepted:** 2026-07-29
- **Review by:** 2026-08-29

### brace-expansion `<=5.0.7` — unbounded expansion DoS (GHSA-mh99-v99m-4gvg)

- **Severity:** high
- **Affected scope:** DEV/BUILD ONLY. Vulnerable copies are transitive through
  ESLint, Sentry's build plugin, and Workbox build tooling. Application code does
  not call `brace-expansion`, `minimatch`, or `glob`, and no attacker-controlled
  glob pattern reaches these tools.
- **Why accepted:** Patched 5.0.8 copies are already selected wherever parent
  ranges permit. Remaining parents require breaking upgrades and cannot safely
  share a global override across incompatible major versions.
- **Removal trigger:** Update the parent tools as they adopt patched
  `brace-expansion`, confirming each old copy disappears from `npm ls
  brace-expansion`.
- **Accepted:** 2026-07-29
- **Review by:** 2026-08-29

## Release-blocking policy

- **Blocks release:** a high or critical advisory that is not documented here or
  whose review date has arrived.
- **Tracked exception:** a finding that is non-exploitable in this architecture,
  dev-only, or fixable only through a breaking dependency migration. Every
  exception needs a scope rationale, removal trigger, and review date.
