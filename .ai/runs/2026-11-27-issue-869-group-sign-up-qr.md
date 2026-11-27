# Run: #869 group sign-up QR code (E29-S02)

- **Goal / trigger**: Cezar run of `om-auto-fix-issue` for #869 (E29-S02, epic #865), queued by the `cezar` label on 2026-11-27. A coach or coordinator shows or prints a group's QR code that opens the section's public sign-up form (D41, #799) with that group chosen.
- **Design authority**: the product brief and D41/D44/D29, as the issue states ("no per-story spec"). The section sign-up form spec gets a changelog file (`.ai/specs/changelog/2026-11-25-vereino-section-sign-up-form/2026-11-27-issue-869-group-sign-up-qr.md`).
- **Branch**: `feat/issue-869-coach-group-qr-signup`, stacked on `feat/issue-868-guardian-invite-links` (PR #888).

## Steps

1. Classified as a feature; FR triage: nothing built, no open PR. Claimed #869 (assignee, `in-progress`, 🤖 comment naming this run).
2. Dependency: the QR rendering (`QrCode`, the `qrcode` package approved on #868 as Q-IL01 "#869 reuses it") lives in PR #888, not merged yet (the merge train waits for the owner's `guard-approved` on the dependency). Stacked this branch on #888's head, so neither PR duplicates the component or conflicts in `packages/ui` and `ClubGroupPage.tsx`.
3. `@vereino/ui`: `qrPosterSvg` + `escapeSvgText` (`member/qr-poster-model.ts`): an A4 SVG poster with the title, lines, the code and the address; 100 % covered (`qr-poster.test.mjs`).
4. `club_core`: `clubCoreDirectory.findSections` returns the section's optional `publicSlug` (additive field on `SectionDirectoryEntry`).
5. `enrolment`:
   - `lib/paths.ts`: `GROUP_QUERY_PARAM`, `groupApplyPath`, `groupSignUpCodeApi`, `linkedGroup` (100 % covered in `misc.test.ts`); error code `group_not_found` (404).
   - `services/directory.ts`: `findGroup` (via `groups.directory`), `sectionPublicSlug` (via `clubCoreDirectory`).
   - `services/sign-up-code.ts` + route `GET /api/enrolment/groups/{id}/sign-up-code` (`groups.view`): `open` with the absolute form address only when the same `publicForm` read P-J2 makes offers the group; `closed` otherwise; 404 for an unknown or other club's group.
   - P-J2: `?group={id}` starts step 2 with the group chosen; a group the form does not offer shows "applications closed".
   - Widget `enrolment.injection.group-sign-up-code` on the new spot `vereino:club:group:actions` (`groups` group page): **Sign-up QR code** → sheet with the code, the address, Download for printing, Copy link, Share; i18n en/pl.
6. Isolation probe for the new route (`inventory/enrolment.json`, `$B:enrolmentGroup`); README of `enrolment`.
7. Integration test `E29-S02` (`.ai/qa/tests/enrolment/E29-S02-group-sign-up-qr.spec.ts`).

## Decisions

- **No new ACL feature**: the route requires `groups.view` (the group page needs it too); the answer is public information (public slugs and the group id). Avoids a role-catalogue change.
- **`closed` mirrors the scanner**: the route calls the same `publicForm` read the public page makes, so "open" means exactly "a parent would get the form with this group".
- **Hidden button while closed**: the group page shows nothing for a group whose code would lead to "closed" (AC 1 asks for the code only for a public group in an open section).
- **Poster as SVG**: vector, crisp in print, drawn in the browser; no PDF library (no new dependency).
- **Form state**: the linked group is computed per render from the latest form (no state set in an effect, lint `react-hooks/set-state-in-effect`); the chosen radio is only the starting value.

## Results

- `yarn typecheck`: pass. `@vereino/ui` tests: 298 pass, 100 % coverage. `enrolment` lib jest: 28 pass, 100 %.
- ESLint on the changed files: one error in the new test (`no-unnecessary-type-conversion`), fixed; one pre-existing warning in `ClubGroupPage.tsx:210`, not from this change.
- `yarn verify`: all steps pass (one run up to `format:check`, then `--from format:check` after formatting the new test).
- Integration `E29-S02`: 1 passed (59.5 s) locally. `ISSUE-628` (cross-club isolation, inventory changed): 1 passed (2.6 min) locally.
- `yarn guard`: 9 blocking findings, all from #888 (the `qrcode` dependency approved as Q-IL01 and its lockfile packages), because guard compares with `main`; this change adds no dependency.

## Open problems / next steps

- Merge order: #888 first. Once it is squash-merged, merge `main` into this branch so only this change remains in the diff, then retarget the PR to `main`.
