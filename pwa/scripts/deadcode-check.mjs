/**
 * Dead-export gate (ts-prune). Fails CI when a module has an export that no other
 * module imports — i.e. genuinely unreachable public surface. Run via `npm run deadcode`.
 *
 * ts-prune over-reports on this codebase, so three categories are filtered out as
 * known false positives (see the deferred-item write-up in CHANGELOG for the why):
 *
 *   1. `(used in module)` — the symbol IS referenced inside its own file. This is
 *      ts-prune's low-signal "exported but not imported elsewhere" heuristic; on a
 *      shared-lib public API (schemas, parsers, types) it fires constantly and is
 *      not actionable. We gate only on FULLY-unused exports (the high-signal case).
 *   2. Barrel files (`**​/index.ts`) — deliberate re-export aggregators; consumers
 *      import screens/services from the canonical module directly, so the barrel's
 *      re-exports always look unused.
 *   3. `contracts/callables/*` — the shared Zod contract surface pairs every schema
 *      with its `z.infer` type by design (some are server-only with no caller yet).
 *      That symmetry is intentional API, not dead code.
 *
 * A newly-added export that nothing imports slips past all three filters and fails
 * the gate. Fix by importing it, or delete it (git remembers).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pwaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(pwaRoot, 'node_modules', '.bin', 'ts-prune');

// ts-prune exits 0 even with findings; we decide pass/fail from the filtered output.
const raw = execFileSync(bin, ['-p', 'tsconfig.app.json'], { cwd: pwaRoot, encoding: 'utf8' });

const isFalsePositive = (line) =>
  line.includes('(used in module)') ||
  /(^|\/)index\.ts:/.test(line) ||
  line.includes('contracts/callables/');

const dead = raw
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((l) => !isFalsePositive(l));

if (dead.length > 0) {
  console.error(`\nDead-export gate: found ${dead.length} unused export(s):\n`);
  for (const line of dead) console.error(`  ${line}`);
  console.error('\nImport the export where it belongs, or delete it (git remembers).');
  console.error('If it is intentional public API, extend the filters in scripts/deadcode-check.mjs.\n');
  process.exit(1);
}

console.log('Dead-export gate: no unused exports.');
