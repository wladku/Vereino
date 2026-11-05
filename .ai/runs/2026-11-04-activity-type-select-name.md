# Main CI repair after #149 and #150: the activity type select's name, a stable coach pick in E06-S11, TEST-030's roster age

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session
- **Trigger:** PR #150 (#93) failed CI `integration`; the owner asked to fix it. #150 merged before the fix was pushed, so it lands on `main` here.
- **Branch:** `fix/activity-type-select-name`, from `main` at 26bda24
- **Status:** completed, PR open for review.

## Goal

Make `main`'s `integration` green again: E03-S02 and TEST-030 fail on every run, E06-S11 at random.

## Steps

1. Read #150's CI log:
   - E03-S02 failed in both attempts: axe `button-name` (critical) on `/backend/activities/activities/create` and on an activity's record page.
   - E06-S11 failed once and passed on retry; the click on the "No coach" option failed because the option was detached from the DOM.
2. The unnamed button is the trigger of #93's `ActivityTypeSelect`, a `type: 'custom'` CrudForm field rendering a Radix `SelectTrigger`.
   - It has no `data-crud-focus-target`, so the platform axe baseline rightly does not cover it.
   - CrudForm's label is not bound to it.
   - Gave it `aria-label` from the field's label.
3. E06-S11: the coach combobox renders its options again when the debounced search answers, which can detach the option under the click. Added `pickComboboxOption`, which retries the pick until the input holds the chosen label, and used it for both coach picks.
4. TEST-030: #149 (#90) added an additive `age` to the roster person, and TEST-030 asserted that person with exact equality. #149 merged before its fix was pushed to its branch, so it lands here: `{ firstName, lastName, age: 8 }` (the fixture's child turns 8 on the club day).

## Commands and results

- On #150's head (cded1cd) with the fix: `yarn verify` 13/13; E03-S02-activities-pages 1 passed (2.0 min); E06-S11 1 passed twice (2.6 min, 1.9 min).
- On `main` (26bda24) with the fix: `yarn verify` 13/13; E03-S02-activities-pages 1 passed (2.6 min); E06-S11 1 passed (2.9 min).
- TEST-030 on `main` (26bda24) with the fix: `typecheck:qa` passed; TEST-030 2 passed (1.8 min).

## Lessons

- None new: `platform-crudform-labels-axe-baseline` already says the baseline covers only platform markup. A custom field's own control needs its own accessible name.
