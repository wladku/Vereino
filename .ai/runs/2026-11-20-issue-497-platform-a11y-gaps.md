# Run: issue #497 — platform accessibility gaps worked around in Vereino (E20-S18)

- **Goal and trigger:** Cezar run `29240a5b` (`om-auto-fix-issue`, label `cezar` on #497, 2026-11-20). Work around the
  `@open-mercato/ui` 0.9.0 accessibility gaps the UX audit of 2026-11-20 found (epic #479, owner decision 7: work around
  on the Vereino side, report upstream, no ejection) and shrink the axe baseline.
- **Issue / branch:** #497, `fix/issue-497-platform-accessibility-gaps`. No spec (bug route).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` comment). Triage in the platform source: `CrudForm.tsx` renders the
   field `<label>` without `htmlFor` and the controls without an id or name; `DataTable` renders its `error` prop as given
   (Vereino passed the server's `error.message`, hence "Internal error") with no retry; `FilterBar`'s `SearchInput` has
   only a placeholder; the AppShell breadcrumb page is a role-less `<span aria-label>`; the brand link's and back link's
   `aria-label` leave out their visible text; `ComponentOverridesBootstrap` passes feature-gated overrides on `/login`,
   which looked like the source of the 401 of `/api/auth/feature-check` on `/login`; the catch-all access-denied states
   offer one link (backend: dashboard; frontend: `/`, the platform start page).
2. `@vereino/ui`: `platform-a11y.ts` (pure, idempotent repairs + `MutationObserver` watcher), `PlatformA11yRepairs`
   (mounted in the backend layout through the client boundary `src/components/PlatformA11yRepairs.tsx`) and
   `TableLoadError` (message + "Try again"). Unit tests at 100 % coverage.
3. Two subagents (disjoint module sets) converted every Vereino `DataTable` `error` prop to `TableLoadError` with the
   list's localized message and its query's `refetch` (42 sites in 38 files); retry keys `facilities.common.retry`,
   `payments.common.retry`, `people.common.retry` added; communication reuses `communication.actions.retry`.
4. `AccessDeniedActions` in the backend and frontend catch-alls (own area + sign out); `vereino.accessDenied.*` keys in
   all five app catalogs.
5. Axe baseline (`_fixtures/axe.ts`): removed `label`, `button-name` (CrudForm), `aria-prohibited-attr` (breadcrumb)
   and the AppShell part of `label-content-name-mismatch`. `CONTRIBUTING.md` local patch rows, engineering standards
   changelog file, lesson `platform-crudform-labels-axe-baseline` updated.
6. Integration test `E20-S18` (`packages/app/.ai/qa/tests/platform/E20-S18-platform-a11y-gaps.spec.ts`).

## Decisions

- **DOM repair instead of per-form custom fields.** `CrudForm` offers no prop for label association; rewriting every
  form's fields as custom fields would touch all forms and still leave dialogs. The repair only adds ARIA attributes
  (never moves or removes nodes), so React's rendering is untouched, and it is idempotent, so the observer settles.
- **A control that shows text** (select trigger, date trigger) is named `aria-labelledby="<label> <control>"`, so the
  name keeps the visible value (WCAG 2.5.3) instead of only the label.
- **List load errors show the list's own message**, never the server text; the message key already existed per list.
- **Frontend portal layout** (`(frontend)/layout.tsx`, customer portal) left alone: Vereino does not use the portal and
  its users are customer accounts, not staff sessions.
- **Search boxes** get `aria-label` from the placeholder, not a visible label: `FilterBar` has no label slot. Upstream
  already fixed the missing name (open-mercato/open-mercato#6500, closed); a visible label is part of the upstream report.
- **The `/login` 401 is not worked around.** A first attempt dropped feature-gated overrides on the sign-in page; the
  integration test still saw one 401, and the generated override list has no feature-gated override at all. The 401 is
  the platform sign-in form's own session probe (`@open-mercato/core` `auth/frontend/login.tsx`, deliberately sent with
  `x-om-unauthorized-redirect: 0`); silencing it needs the form ejected (out of scope). The no-op patch was reverted and
  the gap reported upstream.
- **Upstream reports** (filed 2026-11-20, linked from #497): open-mercato/open-mercato#10118 (CrudForm labels),
  #10119 (breadcrumb), #10120 (brand/back link name), #10121 (DataTable error retry), #10122 (`/login` 401), #10123
  (access-denied actions), #10124 (English toast, E20-S04 draft from #483's run log), #10125 (Switch/Radio target size,
  E20-S12); the search box name was already #6500 (closed upstream, not in 0.9.0).
- Skipped tables: `ClubEventPartsTable` (rows from props), `PreviewPanel` (preview button is the retry),
  `OwnerReport`/`RentedHoursReport` (render after load; their own Alert shows failures).

## Commands and results

- `yarn verify` — first run failed at `lint` (`no-confusing-void-expression` in `table-load-error.tsx`), then at
  `format:check` (same file); fixed, full runs: `all 18 step(s) passed`.
- `yarn workspace @vereino/ui test` — 226 pass, 0 fail, all files 100 % lines/branches/functions.
- `yarn generate`; `yarn typecheck` — no errors.
- `yarn test:integration:vereino --filter E20-S18` — run 1 failed (`expect(featureChecks).toEqual([])`: `[401]`, the
  sign-in probe above); run 2 `browserContext.addCookies: Invalid URL` (page still `about:blank`); run 3 the search box
  is a `searchbox`, not a `textbox`; run 4 `POST /api/people/persons {"error":"Unauthorized"}` (staff created after
  `signInBrowser`, lesson `sign-in-browser-ends-the-api-token`); run 5 `1 passed (1.1m)`. Every axe scan (add person,
  new fee schedule, B-10, sections list; pl/en; light/dark) was clean from run 3 on.
- Screenshots of run 5's build showed the 375 px error state centred across the table's full scroll width (half off
  screen; the page itself did not overflow, so `expectNoPageOverflow` passed) and the sign-out button in the warning
  colour. `TableLoadError` is now `sticky left-0`, left-aligned and capped at the viewport; the sign-out button uses
  `text-foreground`. The test asserts the retry button lies inside the viewport. Rebuilt run: `1 passed`.
- Evidence: 12 screenshots (list error pl/en × light/dark × 1440/375; add person; access denied) in the Cezar task
  assets, `issue-497-evidence.html`, captured by a temporary spec that is not committed.
- Baseline-dependent sample, `--no-build`, one id per run: ENG-TEST-25 1 passed, E07-S01 1 passed, E08-S01 1 passed,
  E03-S02 4 passed, TEST-M05 1 passed, E06-S04 1 passed, TEST-A04 1 passed, TEST-L22 1 skipped (its own condition).

## Open problems / next steps

- `CasesTable`/`ThreadsTable` first-load failure and `ClubSettingsForm`/`PublicationForm` still show `errorMessage`
  (possibly the server's text) through the platform `ErrorMessage`, outside `DataTable`; not in this issue's list.
