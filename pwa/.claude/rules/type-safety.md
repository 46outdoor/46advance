---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "functions/src/**/*.ts"
---

# Type Safety — Zero Any Types

This project enforces a zero-`any` policy from the start. Introducing `any` is a
blocking violation (enforced by the `block-any-types` hook on Edit/Write).

## Prohibited Patterns

- `as any` — type assertion escape hatch
- `: any` — explicit any annotation
- `any[]` — any in generics
- Implicit `any` from missing type annotations on public function parameters

## Approved Alternatives

| Instead of | Use |
|-----------|-----|
| `as any` | Proper type assertion (`as SpecificType`) or type guard |
| `: any` for Firestore docs | `DocumentData` from `firebase/firestore` |
| `: any` for unknown shapes | `unknown` with type narrowing |
| `Record<string, any>` | `Record<string, unknown>` or a typed interface |
| `any[]` | `unknown[]` or typed array |

## Firestore-Specific Typing

Firestore `.data()` returns `DocumentData` (`{[field: string]: any}` internally).
When typing Firestore document shapes in Cloud Functions:

- Use `DocumentData` — not `Record<string, unknown>`, which prevents property access
- Create typed interfaces that extend or complement `DocumentData` when you need specific field access

## Verification

Run `npm run typecheck` (alias for `npx tsc --noEmit`) after every change. This
catches type errors before they reach commits.
