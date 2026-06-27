# Shared callable contracts — moved

The callable contract schemas now live at **`pwa/functions/src/contracts/callables/`**
so the Functions handlers can `import` them for runtime `.parse()` and still deploy
without a workspace package or a bundler step (firebase only uploads `functions/`).

- **Server (Functions):** `import { xxxInputSchema } from './contracts/callables/<domain>.js'`,
  then `parseCallableData(schema, request.data)` (see `functions/src/lib/parseCallable.ts`).
- **Client (PWA):** `import type { XxxInput, XxxOutput } from '@contracts/callables/<domain>'`
  via the `@contracts` alias (configured in `vite.config.ts` + `tsconfig.app.json`).

The files are pure Zod (no firebase imports), so the same source compiles under both the
Functions (nodenext/CJS) and PWA (bundler/ESM) toolchains. When a native `mobile/` app or
an npm workspace is introduced, these can graduate to a real shared package.

This directory is kept only as a pointer; do not add schemas here.
