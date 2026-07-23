## Summary

<!-- What does this change do, and why? -->

## Type

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs
- [ ] chore / test

## Checklist

- [ ] Branched off `main` (`type/name`)
- [ ] `npm run typecheck` + `npm run lint` pass in `pwa/`
- [ ] `npm run test` passes
- [ ] Touched the shared backend? Checked the sibling app (`mobile/`) — see `AGENTS.md` § Cross-App Coordination
- [ ] Updated docs / `CHANGELOG.md` / `planning/` where relevant
- [ ] No `.env`/secrets committed; **no hosting deploy**

## Accessibility / responsive QA (UI changes only)

- [ ] **Keyboard:** new controls are reachable + operable; modals trap focus, close on Escape, and restore focus to the opener
- [ ] **Mobile (~360px):** no horizontal overflow; headers/actions wrap or collapse; touch targets ~44px where practical
- [ ] **Semantics:** labels/roles/landmarks present; axe check added/passing for new key screens

## Notes

<!-- Screenshots, follow-ups, deploy considerations (functions/rules only — hosting ships via the Production Deployment workflow). -->
