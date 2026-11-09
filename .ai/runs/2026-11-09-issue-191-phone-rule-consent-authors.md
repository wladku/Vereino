# Run — issue #191: one phone rule, consent authors by role, catalog and spec follow-ups (from #166)

- **Goal and trigger:** cezar task 688b1fcb (`om-auto-fix-issue 191`), unattended. Close the four non-blocking review items of #166 (E06-S22, #104) under the owner decisions recorded on #191 on 2026-11-09.
- **Spec / issue / branch:** club management spec (`.ai/specs/2026-10-20-vereino-club-management.md`, new DD-47 and DD-48, API table); #191 (`documentation`, `priority-low`); `fix/issue-191-phone-rule-and-consent-authors`.
- **Approval:** the two behaviour changes are the owner decisions in the #191 comment of 2026-11-09 (phone rule everywhere; role label for consent authors outside the family). No migration, dependency or new module. API changes: additive `byRole` on the consents of `GET /api/people/me`; `byName` is now null for an author outside the family; new 422 `phone_invalid` on `POST/PUT /api/people/persons`; new import row error code `import_phone_invalid` — all by the owner's decision.

## Steps

1. Claimed #191 (assignee, `in-progress`, claim comment); renamed the task branch.
2. Phone rule: `isRejectedPhone(next, current)` in `lib/people-rules.ts` (blank clears, an unchanged stored value is kept, otherwise `isValidPhone`); `assertPhoneAllowed` in `commands/shared.ts` throws 422 `phone_invalid` with `fieldErrors.phone`; used by `people.persons.create`, `.update` and `.update_self` (the self command's private helper moved there).
3. Import: `phoneProblem(row, options)` in `lib/import-rules.ts`, applied by `planImport` after the normalization error, so the preview and the commit (which re-plans the stored rows) both mark the row `error` `import_phone_invalid` with its column. A file staged before the rule therefore stops at that row at the commit instead of failing the whole transaction on the command's 422.
4. Consent authors: `consentAuthorRole` and a new `withConsentAuthors(view, { family, names, roles })` in `lib/member-rules.ts`; `services/member-profile.ts` loads each ward's family (the ward and every non-deleted guardianship's guardian, ended ones included) and the staff roles of the authors outside it; names are loaded only for family authors. `ConsentList` shows the role through `people.roles.role.*` or the new `people.club.consents.authorStaff`.
5. Catalogs: removed `people.club.ward.consents.givenOn` / `withdrawnOn` (en, pl; no callers); added `people.club.consents.authorStaff` and `people.imports.rowErrors.import_phone_invalid`.
6. Docs: spec DD-47, DD-48, the `GET /api/groups/member-groups` API row, the 422 / row error notes in the persons and import rows; changelog file; README M-10 note in `docs/ux-concept/README.md`; module README.
7. Tests: unit tests for the new pure functions (people lib 100 %); existing import plan tests moved to valid phone numbers; new integration test `ISSUE-191` (person form API and UI, import preview and commit, consent authors through the API and on Ola's profile at 375 px).

## Decisions

- **Family = ward + any guardian ever linked (not deleted):** a former guardian who changed a consent is still family to the ward; the only non-family author in practice is a club administrator (`set_consents` allows guardians and the administrator).
- **Role label:** the most senior role the author holds (`club_admin` > `coordinator` > `coach`), regardless of the validity period; none → `staff` ("Club staff"). Checking the role at the consent's instant would be more precise but needs the history read for little gain.
- **Import check in the plan, not only the normalization:** catches rows staged before the rule at the commit with a per-row error, as the owner asked.
- **Unchanged stored phone stays:** the admin update keeps the profile's tolerance, so an old free-text number does not block editing other fields.

## Files changed

`packages/app/src/modules/people/{lib/people-rules.ts,lib/import-rules.ts,lib/member-rules.ts,lib/__tests__/*.test.ts,commands/shared.ts,commands/persons.ts,commands/self.ts,services/member-profile.ts,api/me/route.ts,components/club/ConsentList.tsx,components/club/member-client.ts,i18n/en.json,i18n/pl.json,README.md}`, `packages/app/.ai/qa/tests/_fixtures/members.ts`, `packages/app/.ai/qa/tests/people/ISSUE-191-phone-rule-and-consent-authors.spec.ts`, `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-09-issue-191-phone-rule-consent-authors.md`, `docs/ux-concept/README.md`, this log.

## Commands and results

- `yarn generate` — ok; `yarn typecheck` — ok.
- `npx jest src/modules/people/lib` — 8 suites, 179 tests passed; people lib 100 % lines/branches/functions.
- `yarn format` — 3 files reformatted.
- `yarn test:integration:vereino --filter ISSUE-191` — could not start: `Could not find a working container runtime strategy` (no running Docker on this machine; the run may not start Docker Desktop). CI runs it on the PR.
- `yarn verify` — first run: generate … test:scripts (13 steps) passed, then stopped by the tool's 30-minute limit inside `build`; `yarn verify --from build` — passed (63 s). All 14 steps green.
- PR #237 CI (run 42685685239, after the merge train merged `main`): gate, browser-smoke, perf, integration shards 1/3 and 2/3 green (E06-S22 and TEST-051 included); shard 3/3 failed only on `ISSUE-191` at line 68: `expect(JSON.stringify(badRow)).not.toContain('zadzwoń')` — the rows API returns the row's `values` to the administrator by design (the "never the value" rule covers `error_code` / `error_column`, which the test already checks). Removed that wrong assertion; every assertion before it (422s on the person form, the row's `import_phone_invalid` and column) had passed. `yarn typecheck:qa` and `yarn format:check` green.

## Open problems / next steps

- The integration test `ISSUE-191` and the existing `E06-S22` / `TEST-051` must be confirmed green in CI.
