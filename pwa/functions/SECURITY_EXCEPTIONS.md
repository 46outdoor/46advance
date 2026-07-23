# Functions Security Exceptions

Accepted transitive `npm audit` advisories for `pwa/functions/`. Each entry is a
moderate-or-lower advisory with no clean (non-breaking, in-range) fix available,
reached only through the Google/Firebase dependency chain. The scheduled
`dependency-audit` workflow (`.github/workflows/dependency-audit.yml`) surfaces
these without blocking PRs; this file is the record of why they are accepted.

When an entry's review date arrives, re-run
`npm --prefix pwa/functions audit --audit-level=moderate` and check whether a
direct dependency bump now clears the advisory (see the evaluation note below).

## Accepted advisories

### uuid `<11.1.1` — missing buffer bounds check (GHSA-w5hq-g745-h8pq)

- **Severity:** moderate
- **Advisory:** https://github.com/advisories/GHSA-w5hq-g745-h8pq
- **Affected scope:** `uuid` v3/v5/v6 only, and only when a caller passes its own
  output `buffer`. None of our code calls `uuid` directly — it is pulled in
  transitively and used internally by the Google/Firebase SDKs, which do not
  invoke the affected `buf`-argument code path.
- **How it reaches us (transitive only):**
  - `googleapis@^144` → `googleapis-common@7.2.0` → `uuid@9`
  - `firebase-admin@^13` → `@google-cloud/firestore@7` → `google-gax@4` → `uuid@9`
  - `firebase-admin@^13` → `@google-cloud/storage@7` → `gaxios@6` / `teeny-request@9` → `uuid@9`
- **Why accepted (no clean fix):** there is no in-range (`^`) bump that resolves
  it. `npm audit fix --force` proposes `googleapis@173.0.0`, a major (29-version)
  breaking change. Even bumping `firebase-admin` to its latest major (14.x) does
  not fully clear the advisory, because its `@google-cloud/storage` dependency
  still pulls vulnerable `uuid` via `gaxios`/`teeny-request`. The risk is low: the
  vulnerable code path (caller-supplied buffer) is not exercised by these SDKs.
- **Plan:** allow the next Dependabot major-bump cycles for `googleapis` and
  `firebase-admin` to roll the upstream chain onto a fixed `uuid` (≥ 11.1.1), then
  remove this exception. Re-evaluate at the review date below.
- **Accepted:** 2026-06-27
- **Review by:** 2026-09-27

### ts-deepmerge `<8.0.0` — prototype method override DoS (GHSA-87mf-gv2c-c62c)

- **Severity:** moderate
- **Advisory:** https://github.com/advisories/GHSA-87mf-gv2c-c62c
- **Affected scope:** DEV/TEST ONLY. `ts-deepmerge` is reached transitively through
  `firebase-functions-test` (the emulator-test harness) — it never ships to production and never
  merges untrusted/attacker-controlled objects.
- **How it reaches us (transitive, dev-only):** `firebase-functions-test` → `ts-deepmerge`.
- **Why accepted (no clean fix):** `npm audit fix --force` proposes `firebase-functions-test@0.3.3`,
  a breaking downgrade of the test harness. No in-range (`^`) bump clears it.
- **Removal trigger:** when `firebase-functions-test` releases a version depending on
  `ts-deepmerge ≥ 8.0.0` (or vendors its own merge), bump it and remove this entry.
- **Accepted:** 2026-07-23
- **Review by:** 2026-10-23

## Release-blocking policy

- **Blocks release:** a **high or critical** advisory that has a **non-breaking, in-range fix**
  (apply the fix). A direct-dependency high/critical with a fix only in a new major is a **deliberate
  security-major bump** (evaluate + apply), e.g. the 2026-07-23 `nodemailer 6 → 9` upgrade.
- **Tracked exception (does not block):** moderate-or-lower advisories, and any advisory whose only
  fix is a breaking change to a transitive Google/Firebase-SDK or dev-only dependency. Record it here
  with a scope rationale, an `Accepted` date, and a `Review by` date.
- The scheduled `dependency-audit` workflow surfaces all advisories in its job summary; anything not
  listed here is NEW and must be triaged against this policy.
