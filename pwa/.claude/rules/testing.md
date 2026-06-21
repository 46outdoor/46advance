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

- Lines: 75%
- Functions: 75%
- Branches: 70%

(Adjust these during planning if the project calls for different targets.)

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
