# Run: guardian's image consent with history (E30-S02, #871)

- **Trigger:** cezar task b96b0bb1 (`om-auto-fix-issue 871`), unattended.
- **Issue / branch:** #871 / `feat/issue-871-guardian-image-consent` (claimed: assignee, `in-progress`, 🤖 comment
  naming the worktree, branch and start time).
- **Spec:** `.ai/specs/2026-11-26-vereino-event-photos-and-image-consent.md`, phase 1 (Ready for implementation,
  owner decisions and the `people` migration and the narrowing approved on #870, comment 7203995918). The shared
  `ConsentToggle` assigned to this story by the owner decision on #857.

## Steps

1. Read the spec, the `people` consent code (rules, guardianship and own-consent commands, life-cycle carry-over,
   person directory, member profile, erasure, data export) and the member and B-10 consent UI.
2. Pure rules (TEST-I03): `people/lib/image-consent.ts` (BR-I02 veto, BR-I03 adult and carry-over, BR-I04 grant author,
   BR-I05 `imageChangeProblem`, decision role, built-in wording key), `restoreConsentsKeepingWithdrawals` (BR-I06) and
   `changedConsents` in `people-rules.ts`, the `via: 'carry_over'` mark on a stored consent, `carriedOverConsents` with
   the BR-I03 rule for `image`. 100 % coverage.
3. Data: `ConsentEvent` / `people_consent_events` (append-only base, note encrypted, index
   `(organization_id, subject_person_id, kind, created_at)`), migration `Migration20261127065234_people` generated
   offline with `yarn db:generate` (raw snapshot style kept: only additions), `down()` added; table added to
   `PEOPLE_CLUB_TABLES`; error codes `image_consent_subject_only` (422), `consent_note_required` (422).
4. Commands: `set_consents`, `guardianships.create|update`, `set_own_consents` apply BR-I05 and append consent events
   in their transaction; their undo restores with `restoreConsentsKeepingWithdrawals` and appends correcting events;
   `people.consent.image_withdrawn` after the commit; the life-cycle carry-over records `by_role = system` events.
5. Reads: directory `imagePublishable` (and `consentFlags.image` on it), `GET /api/people/me` adds
   `wards[].imagePublishable` and `ownImagePublishable`, the two history routes (service `image-history.ts`),
   isolation probes for both; erasure deletes the subject's events; the person data export lists them.
6. UI: `ConsentToggle` + `changeConsent` in `@vereino/ui` (100 % coverage); `ImageConsentSection` on the ward page and
   M-10 (saves at once, confirmation before a withdrawal, effect line, public photos, wording and history); B-10
   `ImageConsentStaff` (no staff grant, Record withdrawal with a note, history dialog) in `GuardianshipsPanel` and
   `OwnConsentsPanel`; en/pl catalogs.
7. Tests: TEST-I01 (guardian flow at 375 px, pl/en, light/dark, keyboard, history, veto), TEST-I02 (staff rules,
   other guardian 403, note encrypted, undo keeps the withdrawal, B-10 dialog). Ten older tests that let staff grant
   `image` were moved to `regulations`/`trips` (J-001, E02-S02, E02-S03, ISSUE-191, TEST-002, TEST-003, TEST-006,
   TEST-L11, TEST-O01, E20-S12).
8. Docs: people README, `docs/compliance/ropa.md` A2, `legal-verification.md` (OA-I1 row), spec changelog file, spec
   status In progress.

## Decisions

- Consent events are written for every consent kind (DD-I07), not only `image`.
- The wording hash is over the catalog template (the `{name}` placeholder unfilled), so one wording has one hash.
- The erasure deletes the subject's consent events already in phase 1: the table exists from phase 1.
- A guardian acting on the other guardian's row is refused only when `image` changes (other kinds keep today's rule).
- `set_own_consents` maps every staff problem on `image` to 422 `image_consent_subject_only` or
  `consent_note_required` (no other guardian exists there).
- B-10 drops the image checkbox from the editor and the add form instead of disabling it: staff can never set it, and a
  withdrawal needs the note dialog.

## Commands and results

- `yarn generate` → pass; `yarn typecheck` → pass; `yarn db:generate` → people: one migration, no other module.
- Unit: `jest src/modules/people` → 370 passed, 100 % coverage of `people/lib`; `yarn workspace @vereino/ui test` →
  100 % coverage.
- `yarn verify` → first run failed at `lint` (four errors: `@mikro-orm` imported in two routes, `String()` on a string,
  a non-null assertion) — fixed; then `format:check` (fixed with `yarn format`); then `qa-texts:check` (J-001 baseline
  lowered 11 → 10, one hardcoded text removed); then all remaining steps passed. Final run after the last commits:
  green (from `format:check` after a formatting-only commit; the earlier steps passed on the same code).
- `yarn guard` → no blocking findings.
- `yarn test:integration:vereino --filter <ID>`, one id per run: TEST-I01 1 passed; TEST-I02 1 passed; E02-S02 6;
  E02-S03 7; ISSUE-191 1; TEST-002 1; TEST-003 1; TEST-006 2; TEST-L11 2; TEST-O01 2; E20-S12 1; TEST-L09 2; E06-S22 1;
  TEST-X01 1; TEST-L07 3; TEST-M07 2; TEST-O03 1; ISSUE-628 1 — all passed. J-001 first **1 failed**
  (`expect(locator).toBeChecked() failed` at line 560: the ward page's image switch, now not given) — fixed, then
  1 passed.
- PR #896 opened (labels `review`, `feature`, `priority-medium`, `risk-high`, `needs-qa`); claim on #871 released.

## Open problems

- OA-I1: the image consent wording, effect line and confirmation are drafts until the lawyer approves them.

## Next steps

- Phase 2 (#872) registers `people.imageUsage.activities` and subscribes to `people.consent.image_withdrawn`.
