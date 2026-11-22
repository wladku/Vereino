# Run: issue #492 (E20-S13) — notices use the light info style, checkboxes and radios follow the primary colour

- **Trigger:** Cezar run d185dda9 (`om-auto-fix-issue 492`, step 1 of 3 "Build, draft PR"; an independent reviewer marks the PR ready).
- **Issue:** #492, epic #479 (UX audit 2026-11-20, owner decision 6). Depends on #481 (closed).
- **Branch:** `feat/issue-492-notices-light-info-style`
- **Route:** feature, `direct` (no spec: the sibling E20 stories shipped from their issues; the issue lists scope and acceptance criteria). `backend-ui` + tooling (`ds:check`).

## Goal

Information notices render on `--status-info-bg` instead of the platform `<Alert>` default `style="light"`
(`--status-info-border`), through a Vereino `Notice` wrapper; `ds:check` rejects an `<Alert>` without an explicit
`style`; checkboxes and radios fill with `--primary` (a `globals.css` override, no ejection).

## Steps and decisions

1. Claimed #492 (assignee, `in-progress`, `🤖` claim comment naming this run and worktree).
2. `Notice` in `@vereino/ui` (`packages/ui/src/status/notice.tsx`): `<Alert status="information" style="lighter">`; its
   props omit `status`, `style` and `variant`, so a caller cannot turn a notice into something else. Lives in
   `@vereino/ui` next to `StatusTag` because every module uses it.
3. `ds:check` rule `alert-without-style` (`packages/app/scripts/ds-check.mjs`). Decision: the check is in `ds:check`, as
   the issue names, not in lint. The existing `inline-style` rule flagged any `style=` in an opening tag, which would
   also reject `<Alert style="lighter">`; the Alert's `style` is its look, not CSS, so `style=` inside an `<Alert>` tag
   is exempt. The tag is read brace-aware (`findOpeningTags`): `onDismiss={() => …}` does not end it early.
4. Conversion of all 127 `<Alert>` opening tags in `packages/app/src` (a one-off codemod kept outside the repository,
   then reviewed by hand): information alerts (explicit `status="information"` or no status at all) became `<Notice>`;
   error, warning and success alerts got `style="light"` — their look is unchanged (issue: out of scope). Four alerts
   with a computed status were done by hand: three never show information (`style="light"`), the rental-cancel terms
   (`RentalCancelView`) switch `lighter`/`light` with the status. Two local types named `Notice` were renamed
   (`NoShowNotice` in `ClubFacilityPage`, `RolloverNotice` in `SeasonRolloverWizard`) to free the name.
5. `globals.css`: `button[role=checkbox|radio]` redirect `--accent-indigo`/`--accent-indigo-foreground` to
   `--primary`/`--primary-foreground` on those elements only (links and other indigo accents keep the token); the
   platform radio dot is `bg-white`, which would vanish on the near-white dark `--primary`, so it takes
   `--primary-foreground`; native controls get `accent-color: var(--primary)` (unlayered, wins over the platform base
   layer). Contrast: fill 17.9:1 on white, 15.7:1 on the dark page, 14.2:1 on a dark card.
6. `docs/ux-concept/tokens.md`: D-033 §6 rows marked built, `Notice` recorded for information notices.
7. Integration test `E20-S13` (`packages/app/.ai/qa/tests/platform/E20-S13-notices-and-checkboxes.spec.ts`): B-23 empty
   day and M-05 "list opens at" notices paint `--status-info-bg` (not `--status-info-border`); the M-08 checkbox is
   checked and paints `--primary`, ≥ 3:1 on its card; 1440 and 375 px, pl and en, light and dark, screenshots attached.

## Files changed

- `packages/ui/src/status/notice.tsx`, `packages/ui/src/__tests__/notice.test.mjs`, `packages/ui/src/index.ts`
- `packages/app/scripts/ds-check.mjs`, `packages/app/scripts/__tests__/ds-check.test.mjs`
- `packages/app/src/app/globals.css`
- 69 component files under `packages/app/src/modules/**` (Alert → Notice or explicit `style`)
- `packages/app/.ai/qa/tests/platform/E20-S13-notices-and-checkboxes.spec.ts`
- `docs/ux-concept/tokens.md`, this run log

## Commands and results

- `node --test scripts/__tests__/ds-check.test.mjs` — 4 pass (two new: missing style is a finding past an arrow
  function; styled Alert, Notice, Alert parts and a comment pass, a `style` on a `<div>` is still `inline-style`).
- `node --test src/__tests__/notice.test.mjs` (`@vereino/ui`) — 2 pass.
- `node scripts/ds-check.mjs` — before the conversion 127 `alert-without-style` findings; after: `1632 files passed`.
- `yarn verify`: first run failed at `format:check` (`E20-S13-notices-and-checkboxes.spec.ts is not formatted`, the
  spec was written after `yarn format`); after `yarn format`, `yarn verify --from typecheck:qa` → `all 15 step(s)
  passed` (generate, typecheck, typecheck:packages had passed in the first run). Lint warnings on touched files are
  pre-existing `no-unnecessary-condition` on unchanged lines.
- `yarn test:integration:vereino --filter E20-S13` → `1 passed (45.2s)`; 24 screenshots (B-23, M-05, M-08 ×
  1440/375 × pl/en × light/dark) posted on the PR.
- Observation: the member pages (M-05, M-08) stay Polish in the `en` variants — the member area does not follow the
  `/api/auth/locale` switch this test (like E20-S03's) uses; the admin page B-23 switches. Not caused by this change.

## Open problems / next steps

- An independent reviewer checks the draft PR and marks it ready (owner workflow of 2026-11-20).
