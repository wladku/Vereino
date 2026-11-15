# Run: epic #251 — spec N to Ready for implementation

- **Goal and trigger:** unattended cezar run (task fcb0bbaa) of `om-auto-create-pr`: record the owner's decisions of 2026-11-15 in spec N, fix the pre-implementation audit gaps (c1)–(c6), set the status to Ready. Docs only.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`. **Issue:** epic #251 (audit comment 2026-11-15 08:34, owner decisions comment 08:53). **Branch:** `docs/issue-251-spec-n-ready` (the name `docs/issue-251-parity-navigation-naming` is held by another worktree).

## Steps

1. Read the epic's audit and owner-decision comments.
2. Re-checked the audit's code facts before writing them into the spec: the `nav` override applier (`@open-mercato/shared/src/modules/overrides.ts:122-131`, `navOverridesApplier` — prepends, later entry wins with a warning; the umbrella key is `overrides.nav`, so the spec's `overrides.nav.groupOrder` is right and the audit's `overrides.groupOrder` is the inner shape); the hard-coded `/open-mercato.svg` in `auth/frontend/login.tsx:355`; `roles.test.mjs:59` and `activities/README.md:169`; `GET /api/people/me` answers 404 `person_not_linked` without a person; the app catalog has five locales with equal keys and no `vereino.*` or `auth.login.*` keys yet; `sync-role-acls` re-applies `defaultRoleFeatures` idempotently (adds only).
3. Edited the spec: status, Proposed Solution (V-N02, top-bar condition, cookie, V-N05b, app catalog locales, glossary scope), Business rules (retired list, `role_requires_adult`), Compatibility (BC tier of the `events[]` removal), API table, TEST-N04/N09/N10, phases 1, 3, 6, 7, 8, 9, Rollout (approvals, release note, rollback), Risks, AC-N03/N04/N10/N11, Final Compliance, Resolved assumptions, Open Questions.
4. Changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/2026-11-15-issue-251-ready.md`.

## Decisions

- **Status text** is `Ready for implementation` (the template's and the repository's wording for "Ready").
- **Cookie writer:** the client part of the `/login` wrapper, once `?club=` resolves to a published club — not on sign-in, because interceptors cannot set cookies and a Next.js server page cannot either. Hence not `HttpOnly`; it carries only a public slug.
- **Rollback of the grants:** accepted as staying (the previous release shows only widgets whose own features the role holds); removal, when wanted, through the platform role ACL editor. No corrective script.
- **`de`/`es`/`ko`:** English value as the stated fallback for the new app-catalog keys and overrides.
- **Retired list:** seven patterns with key scopes; patterns that would catch legitimate uses (`zdarze`, `obiekt`, `harmonogram`) are scoped; rules 1–2 left to the native-reader review.
- **#260 note** is written into the spec (phase 6, AC-N03); no comment was posted on #260 (docs-only scope).

## Commands and results

- `yarn spec-changelogs:check` → "Spec changelogs are valid".
- `yarn verify` → `[verify] all 15 step(s) passed`, exit 0.
- No integration test: docs only.

## Open problems and next steps

- V-N01, V-N03, V-N04 stay with the implementers (fallbacks defined).
- Phase 9 must confirm before merging that no shared environment is deployed (BC gap).
