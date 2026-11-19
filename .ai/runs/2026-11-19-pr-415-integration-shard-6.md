# Run: PR #415 — integration (shard 6/6) red

- **Goal and trigger**: cezar task (`om-auto-fix-pr 415`): the required check `integration (shard 6/6)` failed on PR #415 (issue #312, staff setup checklist, person photo and signed contract PDF). Bring main in, make the check green, never merge.
- **Issue / PR / branch**: #312 / #415 / `feat/issue-312-coach-setup-checklist` (worked on a detached HEAD at its origin tip, pushed with `git push origin HEAD:feat/issue-312-coach-setup-checklist`).

## Steps

1. Base: `origin/main` (26b534bf, #414) was already an ancestor of the PR head (39de4dc8), so there was nothing to merge.
2. Read the failed job log (run 44489065761, job 135439930647): 1 failed, 44 passed. The failure repeated on the retry, so it is not a flake:
   - `TEST-L18-staff-setup-and-files.spec.ts:195`: `expect(getByText('Tomasz Nowy')).toBeVisible()`: `element(s) not found` (20 s).
3. Root cause (test bug; the product code is correct): "Add a contract" opens `/backend/club/contracts/create?personId=…`. The form presets `partyId` and the party `ComboboxInput` resolves the name through `resolveLabel` (`/api/people/persons?ids=…`, a filter the persons list supports). The platform combobox shows that label as the `value` of its `<input>`, and `getByText` never matches an input value. The assertion now reads `expect(page.locator('[data-crud-field-id="partyId"] input')).toHaveValue('Tomasz Nowy')`; it still proves the person is named as the coach party.
4. Checked the rest of the test for the same pattern: `groups-membership-person` wraps a `LookupSelect`, which renders the deep-linked person as a list row (text), so `toContainText` is correct there.
5. Lesson: new `combobox-label-is-an-input-value`.

## Decisions

- Fixed the test, not the component: showing the chosen label in the input is the platform's behaviour; the assertion was made exact (`toHaveValue`), not weaker.
- No local browser run: the Cezar host cannot launch Chromium (lesson `cezar-host-integration-runs-without-browser`); CI is the evidence for the browser half.

## Files changed

- `packages/app/.ai/qa/tests/people/TEST-L18-staff-setup-and-files.spec.ts`
- `.ai/lessons/combobox-label-is-an-input-value.md` (new)
- this run log

## Commands and results

- `yarn typecheck:qa` — exit 0.
- `yarn qa-texts:check` — 0 problems.
- `prettier --check` on the test — clean.
- `yarn lessons:check` — catalog valid.

## Open problems / next steps

- Watch `integration (shard 6/6)` on the pushed head; the PR keeps `needs-qa` for a human QA sign-off.
