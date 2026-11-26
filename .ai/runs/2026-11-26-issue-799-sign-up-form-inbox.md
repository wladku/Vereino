# Run log — #799 E26-S03 sign-up form, confirmation, coordinator inbox and waiting list (phase 2)

- **Goal / trigger:** Cezar run (task 980a1da2) of `om-auto-fix-issue` for #799; phase 2 of
  `.ai/specs/2026-11-25-vereino-section-sign-up-form.md`.
- **Branch:** `feat/issue-799-sign-up-form-inbox-waiting-list`; started 2026-11-26.
- **Approvals:** owner decision on #788 (2026-11-26): module `enrolment`, its three tables, `people.duplicateCandidates`,
  `emailSubjectLimit` in `foundation`, the spot `vereino:public:section:actions`. The slug-free system-scope exception
  is not approved: every token lookup is scoped to the club from the slug.

## Plan

1. Helpers (subagents, disjoint files): compliance pack (A17, D-15, R22–R24); `emailSubjectLimit` with facilities
   switched; `people.duplicateCandidates`.
2. `enrolment` core: scaffold, entities + migration, pure lib (states, age, waiting numbers, flags, keys), validators,
   error codes, encryption, events, notifications, e-mail templates, services, commands, routes, club jobs, offboarding
   contributor, role seeds, i18n.
3. UI: P-J1 spot widget, P-J2 form, P-J3 confirm, P-J4 status; M-J1 tile, M-J2 list, M-J3 detail (reject, waiting);
   B-J1 back-office list and the overdue dashboard widget.
4. Isolation inventory + seed; integration tests TEST-J02…J06 (J06 reject/waiting), J11 retention part.
5. `yarn verify`, the integration tests locally, PR.

## Steps

1. Claimed #799 (assignee, `in-progress`, 🤖 comment); renamed the branch; read the spec, the facilities request
   pattern (DD-44), the foundation token-link and limit primitives, `groups.applicationTargets` (phase 1).
2. Subagents (disjoint files, no commits): compliance pack (A17, D-15, R22–R24, Q-J09 lawyer item); `emailSubjectLimit`
   + `enforceFailClosedLimit` in foundation with the facilities route switched; `people.duplicateCandidates`
   (pure `lib/duplicate-candidates.ts` at 100 %, service, DI).
3. Coordinator: module `enrolment` — entities, encryption, pure lib (states, age DD-J03/BR-J2, applications, access) with
   tests at 100 %, validators, error codes, events, notification types, e-mail templates, services (directory, links,
   mail, views), commands (submit, confirm, withdraw, resend ×2, reject, wait, two retention jobs), 12 routes, CLI,
   workers, DI, ACL, role seeds; `clubCorePublicSite.applicationSection`; `failClosed` option of
   `enforceSessionlessLimits` (so the integration opt-in limiter counts the per-address limit); `next.config.ts`
   no-referrer/no-store for the token pages. Migration generated offline from an empty seed snapshot (lesson
   `axe-baseline-suspended-runs-and-offline-db-generate`); a second `db:generate` reports no changes.
4. Subagents: public pages (P-J1 widget on the new spot, P-J2 form, P-J3, P-J4; `public-section` bootstrap profile) and
   member/back-office pages (M-J1 tile, M-J2, M-J3 with reject/waiting sheets, B-J1, dashboard widget). Coordinator merged
   their i18n fragments (flattened) into `enrolment/i18n/{en,pl}.json`.
5. Isolation inventory `enrolment.json` + `seed-enrolment.ts`; fixtures `_fixtures/enrolment.ts`; TEST-J02…J06, J11.
6. Gate fixes: lint OOM (heap 8 GB, lesson `axe-scan-reloads-multi-step-forms-and-lint-heap`), reserved e-mail domain in
   a unit test, `has-checked:` instead of arbitrary variants, widget title keys, an `[internal]` literal, glossary
   ("trening próbny" instead of the retired "zajęcia").

## Decisions

- **P-J1** through the approved spot `vereino:public:section:actions`; the public section page (only that path) loads the
  injection registry (profile `public-section`, lesson `club-routes-need-the-member-bootstrap-profile`).
- **Token lookups** always pass the slug's club scope (`LookupOptions.scope`); the slug-free exception is not used.
- **`auditedRead`** for a coordinator's detail read would need a module read-log table that the approved migration does
  not contain; the read is recorded in the platform access log instead (purpose `enrolment.decide`). The module log
  comes with the coaches' reads of phase 4 (needs the table approved there).
- **Member list** is a hand-written route over `listApplications` (in-memory `q`, computed numbers and flags), not
  `makeCrudRoute`; paged shape S6.4.
- **Member nav entry** skipped (fixed list in `packages/ui`); the Today tile is the way in.
- **Release rule**: the section field stays hidden; tests switch it through the section's public route.

## Commands and results

- `yarn verify` — all steps pass (after the gate fixes above).
- `yarn test:integration:vereino --filter TEST-J02|J03|J04|J05|J06|J11|ISSUE-628` — each `1 passed` locally. First runs
  failed on test timing only: J03 read an e-mail before the dispatch delivered it (now `awaitEmails`); J02's axe scan
  reloaded the form (ready callback re-walks to step 2).
- Unit: `jest src/modules/enrolment/lib --coverage` 100/100/100/100.

## Open problems / next steps

- Q-J09: the lawyer confirms Art. 6(1)(b) and the default information text before the production release.
- Phase 3 (#800): accept, freed places, season rollover/end, export/erasure, applicant CLI, the visible section switch.
- P-J4 shows no trial session details until phase 4.

## Follow-up run: CI fix on PR #830 (2026-11-26, om-auto-fix-pr)

- Trigger: required check `integration (shard 5/6)` failed: `ISSUE-483` saw `GET /api/enrolment/applications?tab=new… 403`
  (twice) for the guardian on `/club`. Cause: the Today spot does not enforce `metadata.features`, and the
  Applications tile read the inbox for every member.
- Fix: `useApplicationCounts` (`components/club/applications-client.ts`) runs `POST /api/auth/feature-check` for
  `enrolment.applications.view` first and returns `null` without it; the tile renders nothing for `null`.
  Lesson `club-spot-widgets-hide-themselves-when-refused` extended (enrolment, feature check before the read).
- Merged `origin/main` (e19d87dc) into the branch on a detached HEAD, pushed with `git push origin HEAD:<branch>`.
- `yarn typecheck` — pass (after `yarn install` and `yarn generate` in the fresh worktree).
- `yarn test:integration:vereino --filter ISSUE-483` — `1 passed`; `--filter TEST-J05` (asserts the tile) — `1 passed`.

