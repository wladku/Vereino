# Run: #600 — the 18th-birthday notices on the ward card at 375 px (AC-L07)

- **Goal and trigger:** cezar task f20c27ef, `om-auto-fix-issue 600` (label `cezar`). Close the AC-L07 gap of `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md`: a browser test of `people/components/club/LifeCycleNotices.tsx` on the ward card and the own card at 375 px, Polish and English, light and dark, axe clean, texts through `uiText()`.
- **Issue / branch:** #600 / `test/issue-600-birthday-notices-ward-card`.
- **Started / finished:** 2026-11-22.

## Steps

1. Claimed #600 (assignee, `in-progress`, the `🤖` claim comment naming this run).
2. Read `LifeCycleNotices.tsx`, `GET /api/people/me` (`wards[].notices`, `notice`), `people/lib/life-cycle-rules.ts` and the phone part of `TEST-L10-account-age` (the pattern for the `may_have_account` line).
3. Added `packages/app/.ai/qa/tests/people/TEST-L09-coming-of-age-notices-phone.spec.ts`: a guardian, a ward with an account who turns 18 in ten days and an adult who turned 18 five days ago. The API shows the lines first; then at 375 px, per locale, the guardian's ward card on `/club/profile` and `/club/wards/{id}` read "Turns 18 on {date}: from then Jan decides alone" (no `may_have_account` line, because Jan has an account), the ward's own card reads the `turns18` title and body, and the adult's the `cameOfAge` ones; no page overflow; axe in light and dark (`scanInColorSchemes`).
4. Ticked AC-L07 with the evidence; added the spec changelog file. The status line is unchanged (lifecycle state only).

## Decisions

- **A separate spec file named after TEST-L09:** the spec maps AC-L07 to TEST-L09. A separate file lets `--filter TEST-L09-coming-of-age-notices-phone` run the phone test alone, without the job-driven domain test.
- **No life-cycle job run:** the member API derives the lines from the birth date and today, so the test uses birth dates relative to today.
- **The date is checked exactly:** the expected text uses the same `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })` as `formatCalendarDate`.

## Files changed

- `packages/app/.ai/qa/tests/people/TEST-L09-coming-of-age-notices-phone.spec.ts` (new)
- `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (AC-L07 ticked)
- `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/2026-11-22-issue-600-coming-of-age-notices-phone.md` (new)
- this log

## Commands and results

- `npx tsc --noEmit -p packages/app/.ai/qa/tests/tsconfig.json`: no errors.
- `yarn test:integration:vereino --filter TEST-L09-coming-of-age-notices-phone`: `1 passed (1.0m)`.
- `yarn guard`: `No blocking findings.`
- `yarn verify`: `[verify] all 20 step(s) passed`.

## Open problems / next steps

None. No product code changed.
