# Issue #102: a member sees case marks, copies the text for the group chat and a coach posts an announcement from the phone

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task 2c7b2431), `om-auto-fix-issue` with the repo-local override applied; no subagents
- **Trigger:** `/om-auto-fix-issue 102` (E06-S20, epic #82)
- **Branch:** `feat/issue-102-member-thread-case-share-announce`, from `main` at 26bda24
- **Status:** completed, PR open for review.

## Goal

Bring the backend-only thread functions to the member inbox on the phone (README M-06, M-07, F-05; club spec REQ-009, REQ-010): the "Case" mark, the last author and a guardian's ward filter on `/club/messages`; "New announcement" for anyone with `communication.post`, "To" limited to their own sections, groups and sessions, with the toast "Sent to {n} people (in the app + e-mail)" and the new thread; on `/club/messages/[threadId]` the case banner, "Copy text for group chat" for the author or a coach of the scope, and "E-mail: {n} delivered · {m} not delivered" under the author's own messages.

## Steps

1. Classified #102 as a feature (label `feature`). FR triage: open, unclaimed, no PR referencing it; the backend pieces existed (`ThreadComposer`, `ShareTextPanel`, the case banner, `DeliveryStatusList`), the member pages had none of them, and the list had no ward filter. Q1 (limits) answered by the owner on 2026-11-04: the server's limits stay. Covering specs: the club spec (`/club/messages` UI row, REQ-009/010) and foundation III (`/club/messages` row) — updated, no new spec, as for #103 and #90. No migration, module, dependency or breaking contract, so no Ask First item.
2. Claimed #102 (assignee, `in-progress`, 🤖 comment) and renamed the task branch.
3. Pure logic `communication/lib/member-inbox.ts`: `wardThreadsOf`, `MEMBER_COMPOSER_KINDS` / `memberComposerKinds`, `emailDeliverySummary`; unit tests at 100 %.
4. Server (additive): `GET /api/communication/threads?wardId=` (only a ward of the caller; otherwise an empty page), `POST /api/communication/threads` answers `recipientCount`, the thread's messages carry `emailCounts` for the reader's own messages; foundation `dispatch.countsOf` takes an optional `{ channel }`.
5. UI: `ThreadComposer` embeddable (`embedded`, `selectKinds`, `onPosted`, `onCancel`); `ClubMessagesPage` with the case mark, "scope · last author · time", the ward toggles and the "New announcement" dialog; `ClubThreadPage` with the case mark and banner, `ShareTextPanel` for the thread's staff and the e-mail line; the case banner's title now reads "Case — messages cannot be deleted or edited" (backend too).
6. en + pl strings; module README; club spec and foundation III rows and Changelogs.
7. Integration test `communication/E06-S20-member-case-share-announce.spec.ts` (API + browser at 375 px).

## Decisions

- **Ward filter = the ward's groups (any membership period), those groups' sections' own threads, and the direct threads the ward takes part in (Kuba, 16 with an account, receives the club-wide announcement himself, which still is not about him).** A minor without an account is not a thread participant (the guardian is), so participation alone would miss most of a child's threads; the thread's `group_id` snapshot covers group, activity and session threads. Club-wide threads are not "about" a ward and drop out of the filtered list ("All" shows them). A `wardId` that is not one of the caller's `guardian` grants lists nothing, like a foreign `sectionId` (#103).
- **Ward filter shown for any guardian** (one ward or more), as toggles with `aria-pressed`, kept in component state.
- **Member composer kinds:** section, group, session — the issue's "own groups, sections or sessions"; the club-wide and activity kinds stay on the backend composer. The server still authorizes every audience (403 `scope_denied`).
- **"New announcement" is a dialog** with the embedded backend composer (concept: "new announcement dialog (`CrudForm`)"), a button next to the heading rather than a floating one (no overlap with the member navigation at 375 px). No extra "Cancel" button: an embedded `CrudForm` renders `extraActions` both above and below the form, so the dialog's own close button and Escape cancel.
- **Recipient count** = the dispatch's reachable recipients (`resolved.counts.recipients`), the number `AudiencePicker` previews.
- **E-mail line:** e-mail channel only; sent = delivered, failed + skipped = not delivered, queued shown as "on the way" when any. Only under the reader's own messages (the author), never another author's.
- **"Copy text for group chat"** for the thread's staff (`thread.staff`: the author, the scope's coaches, the section's coordinator, the administrator); the route still requires `communication.post`.
- **Limits (Q1):** subject 1–200, message up to 10 000 characters — the server's, unchanged.

## Commands and results

- `yarn generate`, `yarn typecheck`: passed.
- `npx jest src/modules/communication/lib --coverage`: 43 passed; `member-inbox.ts` 100 % lines, branches, functions.
- `npx eslint src/modules/communication …`: one warning (an unnecessary `?? []`), fixed.
- `yarn test:integration:vereino --filter E06-S20`, first run: failed at the ward filter — `wardId` = Kuba returned the Żaki thread and the club-wide thread (`Expected [zaki] / Received [zaki, club]`): Kuba has an account and is a participant of the club announcement himself. Fixed by counting the ward's own participation for `direct` threads only.
- Second run: failed at `dialog.getByLabel(/^(Subject|Temat)/)` (timeout): the installed `CrudForm` renders the field label as a sibling text, not a `<label for>`, so the text boxes have no accessible name (the backend composer has the same gap; framework-owned). The test reaches them through `[data-crud-field-id]`, as the existing lesson `integration-fixture-pitfalls-tokens-crudform-undo` says (found after the fact; the lesson's rule was not read before writing the test). The snapshot also showed the duplicated "Cancel" (see Decisions).
- Third run: 1 passed (1.7 min).
- Regression, one id per run, over the changed screens and API: TEST-M10 1 passed (1.5 min), TEST-M05 1 passed (2.1 min), E06-S21 2 passed (2.3 min), TEST-M09 2 passed (1.8 min), J-003 1 passed (2.0 min).
- `yarn verify`, first run: failed at `ds:check` — `ClubMessagesPage.tsx:135:22 [arbitrary-tailwind]` (`max-h-[90dvh]` on the dialog). Removed: `DialogContent` already caps its height and scrolls.
- `yarn verify`, second run: failed at `format:check` (`ClubMessagesPage.tsx` not formatted after that edit); `yarn format`.
- `yarn verify`, third run: all 13 steps passed (`test` 3798 s).
- After the gate the test switched to `[data-crud-field-id]` selectors: `yarn test:integration:vereino --filter E06-S20` 1 passed (2.3 min); `yarn format:check` 0 unformatted, `yarn typecheck:qa` and `yarn lessons:check` green (only the test, the lesson and this log changed since the full gate).

## Lessons

- New: `embedded-crudform-extra-actions-render-twice`.
- Missed and then applied: `integration-fixture-pitfalls-tokens-crudform-undo` (`[data-crud-field-id]`) and `platform-crudform-labels-axe-baseline` (CrudForm labels not associated, already known upstream).

## Open problems

- The installed `CrudForm` text fields have no accessible name tied to their visible label (known: lesson `platform-crudform-labels-axe-baseline`); upstream, not patched here.
