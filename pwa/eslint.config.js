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
);
