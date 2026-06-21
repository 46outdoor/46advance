/** dependency-cruiser config — see AGENTS.md (arch:check). */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make code hard to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-feature',
      severity: 'error',
      comment: 'Features must not import from other features; share via @/lib, @/types, @/contexts.',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/(?!$1)([^/]+)/' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan modules are usually dead code.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)index\\.ts$', 'vite-env'] },
      to: {},
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.app.json' },
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
  },
};
