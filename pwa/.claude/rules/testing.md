---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "src/**/*.spec.ts"
  - "functions/src/**/*.spec.ts"
  - "tests/**/*"
---

# Testing Conventions

## Test Runner

- Unit tests: Vitest (`npm run test`)
- E2E tests: Playwright (`npm run test:e2e`)
- Run targeted tests during development: `npm test -- src/path/to/file.test.ts`
- Run the full suite before pushing

## Coverage Thresholds

Enforced by `vite.config.ts` (`test.coverage.thresholds`) and gated in CI (the `test`
job runs `npm run test:coverage`). A **ratchet** model, not a flat target:

- **Global floor** (whole app): statements/lines 20%, functions 18%, branches 75% —
  locks overall coverage; raise as it improves.
- **High per-directory bars** lock in the well-covered pure business-logic libs so they
  can't regress: `src/lib/{advances,events,quotes}` ≈95%+ lines/functions; `src/lib/rbac`
  and `src/lib/schedules` are set to their (lower) current `functions` coverage rather
  than an aspirational number.

Raise the bars as coverage grows; never lower one to make a change pass — add the test.

## File Naming

- Unit tests: `*.test.ts`, `*.test.tsx` (colocated with source)
- Cloud Functions tests: `*.spec.ts` (in `functions/src/**/`)
- E2E tests: `tests/` directory at project root

## Type Safety in Tests

Tests follow the same zero-any rule as production code:

- No `as any` in test files
- Use proper mocking types from Vitest (`vi.fn()`, `vi.mocked()`)
- Create typed test fixtures instead of untyped object literals
- Use `Partial<T>` for partial mocks, not `as any`

## Firebase Mocking

- Mock Firebase sparingly — prefer integration tests with emulators when possible
- Emulators: `npm run dev:emulator` (Auth:9099, Firestore:8080)
- When mocking Firestore, use `DocumentData` for document shapes

## Test Structure

```typescript
describe('FeatureName', () => {
  it('should describe expected behavior', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

Keep tests focused on behavior, not implementation details. One assertion per test
when practical.
