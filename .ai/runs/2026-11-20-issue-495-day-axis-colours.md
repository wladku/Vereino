# Run: issue #495 — day axis in the mockup's colours, the place page at 768 px

- **Trigger:** Cezar automation (`cezar` label on #495), skill `om-auto-fix-issue` with the repo-local override.
- **Issue:** #495 (E20-S16, epic #479), labels `bug`, `priority-low`, `risk-low`.
- **Branch:** `fix/issue-495-day-axis-colours-place-page-768px` (Cezar worktree), base `main` @ `995fda4c`.
- **Route:** `backend-ui` + `debugging`, delivery `direct` (bug fix, no spec change: the facilities parity spec fixes no colours).

## Goal

The day axis (B-23, M-11) uses the mockup's colours with `--status-*` tokens and no `status-pink`; the legend swatches
measure at least 3:1 with a word next to each; `/club/places/[id]` does not scroll sideways at 320, 375 and 768 px;
`ds:check` rejects `status-pink`.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch). No open PR referenced it.
2. Triage: confirmed on `main` — `KIND_TAGS` mapped sessions to `info`, closures to `error`, maintenance to `pink`
   (`--status-pink-*`, not in `docs/ux-concept/tokens.md`); legend swatches used the pale `-bg` fill with the `-border`
   200 shade (about 1.3:1 on white).
3. Mockup (`docs/ux-concept/mockups/styles.css`): `.blk-occ` sessions = success, `.blk-int` club booking = info,
   `.blk-rent` rental = warning, `.blk-pend` request = dashed, `.blk-closed` = the grey closed zone; zones public blue,
   club green, paid amber, closed grey.
4. Fix: `KIND_TAGS` session → success, booking → info, closure and maintenance → neutral (told apart by the double and
   dotted border); `ZONE_TAGS` public → info, club → success, closed → neutral; `WeekZonePreview` imports the shared
   `ZONE_TAGS` instead of its own copy; the `pink` tone is gone; legend swatches take a 2 px edge in the `-icon` token.
5. `ds:check` rule `colour-named-status-token` (`\bstatus-pink-`) with a negative-case unit test
   (`packages/app/scripts/__tests__/ds-check.test.mjs`).
6. Reproduced the overflow with the extended TEST-R12 before the layout fix:
   `page wider than 768 px by 13 px: div[data-slot="input-wrapper"] right=781` — the "Other day" field beside the day
   chips (`md:flex-row`). Fix in `DayChips.tsx`: from `md` the chip row takes `min-w-0 flex-1` and wraps, the field
   group is `shrink-0`; `ChipRow` takes an optional `className`.
7. TEST-R12 extended: 768 px and 320 px overflow checks, legend swatch variants, swatch contrast ≥ 3:1 light and dark.
   `expectNoPageOverflow` takes an optional width.

8. PR #510 opened with labels and screenshot evidence; a fresh review agent approved with low/medium findings. Fixed:
   `KIND_TAGS`/`ZONE_TAGS` typed `Record<…, AxisTone>` (no `pink`/`brand`), so restoring `maintenance: 'pink'` fails
   the typecheck (checked: `TS2322: Type '"pink"' is not assignable to type 'AxisTone'`); the `tags.ts` comment no
   longer calls the mockup's requests grey; the contrast helper fails on a colour the canvas cannot parse. Left as
   follow-ups: requests in the mockup's dashed amber, and four neutral legend entries told apart only by border style.

## Decisions

- Zones are recoloured too: the issue's "closed grey" covers the closed zone, and the mockup's public/club colours are
  the reverse of what the app had. One `ZONE_TAGS` for the axis and the week preview so the two screens cannot drift.
- Requests stay neutral (dashed): the issue names sessions, closures and maintenance only.
- The swatch keeps the pale fill and gains an icon-token edge rather than becoming a solid dot, so the kind's border
  style (dashed, double, dotted) still reads in the legend.

## Files changed

- `packages/app/src/modules/facilities/components/day-axis/tags.ts`
- `packages/app/src/modules/facilities/components/day-axis/DayAxis.tsx`
- `packages/app/src/modules/facilities/components/WeekZonePreview.tsx`
- `packages/app/src/modules/facilities/components/day-axis/DayChips.tsx`
- `packages/app/scripts/ds-check.mjs`, `packages/app/scripts/__tests__/ds-check.test.mjs`
- `packages/app/.ai/qa/tests/_fixtures/axe.ts`, `packages/app/.ai/qa/tests/facilities/TEST-R12-member-day-page.spec.ts`

## Commands and results

- `node --test packages/app/scripts/__tests__/ds-check.test.mjs` — 2 passed.
- `node packages/app/scripts/ds-check.mjs` — 1618 files passed.
- `yarn test:integration:vereino --filter TEST-R12` before the layout fix — failed as expected:
  `Error: page wider than 768 px by 13 px: div[data-slot="input-wrapper"] right=781 ""`.
- `yarn test:integration:vereino --filter TEST-R12` after the fix — 1 passed (768/375/320 px, swatch contrast light and
  dark, axe pl/en light/dark).
- `yarn test:integration:vereino --filter TEST-R03` — passed on retry (1 flaky). The first attempt failed on a console
  error unrelated to this change: `Failed to fetch RSC payload for http://127.0.0.1:5934/backend/facilities/calendar?place=…
  Falling back to browser navigation. TypeError: Failed to fetch` (a Next.js prefetch cut off by `page.goto`).
- `yarn verify` — first run failed at `lint` on Playwright HTML report files in `packages/app/.ai/qa/test-results/`
  left by the local integration runs (not source); after deleting them `yarn verify --from lint` passed, then a full
  `yarn verify` run: all 18 steps passed.
- Browser evidence: a temporary, uncommitted copy of TEST-R12 took screenshots (pl/en, 375/768/1440 px, light/dark);
  it was deleted after the run.

## Next steps

- PR review and QA by the pipeline; the owner decides on an ESLint ignore for `.ai/qa/test-results/**`
  (lesson `local-playwright-report-breaks-lint`, third occurrence).

## Open problems

- TEST-R03 flakes on a Next.js "Failed to fetch RSC payload" console error during navigation; not caused by this change.
- Local integration runs leave `packages/app/.ai/qa/test-results/html` behind, which `yarn lint` then scans; delete it
  before `yarn verify`.
