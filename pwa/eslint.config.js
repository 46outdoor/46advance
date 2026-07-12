import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Project rule: zero `any` (see .claude/rules/type-safety.md).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Project rule: use createLogger(), never console.* (see AGENTS.md).
      'no-console': 'error',
      // Size & complexity guardrails (see .claude/rules/code-organization.md).
      // Counts exclude blank lines and comments, matching the file-size-monitor
      // agent. These encode the *hard* limits as merge gates; the *soft* limits
      // (500-LOC files, 100-line functions) stay advisory via that agent.
      //
      // max-lines: 1000 = documented hard file limit (worst source today ≈ 263).
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
      // max-lines-per-function: 200 for logic (.ts); .tsx is relaxed below since a
      // React component is one long render function (worst .ts fn today ≈ 119).
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      // complexity: 25 after decomposing the high-complexity functions (was 45).
      // Repo max is now 24; ratchet further toward ~20 as the remaining 22–24s
      // (AdvanceForm, EventScheduleScreen, parseBooking) are simplified.
      complexity: ['error', 25],
    },
  },
  {
    // React components are effectively one long render function; JSX makes them
    // long by nature, so the file-level max-lines is the real control and the
    // per-function limit is relaxed here (worst component render today ≈ 251).
    files: ['**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Test files get the documented higher LOC budget (hard limit 2000); the
    // per-function and complexity limits don't apply — a describe() block is a
    // single large function. Covers colocated tests, the rules-test suite
    // (test/), Playwright e2e (tests/), and shared test infra (src/testing/).
    files: ['**/*.{test,spec}.{ts,tsx}', 'test/**', 'tests/**', 'src/testing/**'],
    rules: {
      'max-lines': ['error', { max: 2000, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': 'off',
      complexity: 'off',
    },
  },
  {
    // The logger/Sentry sink are the one place console is allowed.
    files: ['src/lib/logger.ts', 'src/lib/sentry.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Node-context config files.
    files: ['*.config.{js,ts}', '*.cjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Cloud Functions are server-side Node; react-refresh (a client fast-refresh
    // rule) doesn't apply, even to the @react-pdf/renderer packet components.
    files: ['functions/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // One-off Node ops/migration/seed scripts (run via tsx); console is their UI
    // and they aren't part of the app or functions build.
    files: ['scripts/**/*.{ts,mts}', 'functions/scripts/**/*.{ts,mts}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
);
