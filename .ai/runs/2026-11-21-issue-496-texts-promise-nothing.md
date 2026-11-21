# Run: issue #496 — texts promise nothing, invent no prices, error and empty messages name what to do

- **Trigger:** Cezar run (`om-auto-fix-issue`, step 1 of 3 "Build, draft PR"), label `cezar` on #496 (E20-S17, epic #479).
- **Issue:** https://github.com/wladku/Vereino/issues/496
- **Branch:** `fix/issue-496-texts-promise-nothing-messages`
- **Spec gate:** `direct` (copy fix of the UX audit 2026-11-20; no contract, schema or module change). Dependency E20-S15 (#494) is closed.

## Goal

Small text findings of the UX audit: B-30 empty state, B-31 template prices, `/login` error, M-02 ward tile, M-08 load
error, attendant (M-12) messages and the M-16 empty state.

## Steps and decisions

1. Claimed #496 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. **B-30** `payments.orders.empty.description` = the mockup's `route.B-30.emptyText` ("Utwórz formularz zamówień." /
   "Create an order form.").
3. **B-31** the "Academy kit" template keeps names, sizes and the set, but no prices: an invented price would be saved
   by an administrator who only checks the names. The form already refuses a blank price and names the product
   (`payments.orders.validation.price`); loading the template flashes `payments.orders.template.pricesHint`.
4. **`/login`** the platform key `auth.login.errors.invalidCredentials` is overridden in the app catalog
   (`packages/app/src/i18n/{pl,en}.json`, like the brand keys): it points to "Nie pamiętasz hasła?" below the button.
   The platform login page is not ejected.
5. **M-02** `people.club.wards.birthDate` = "Data urodzenia: {date}" / "Date of birth: {date}" (no gendered form).
6. **M-08** `payments.club.errors.load` named the profile; it now names payments. `PaymentsClubFrame` gets an
   optional `loadErrorKey` so the orders pages (M-16, M-17) name orders (`payments.orders.club.errors.load`) instead.
   The retry button ("Spróbuj ponownie") was already there.
7. **M-12 attendant**: write errors (open, close, group, incident, no-show) add "Spróbuj ponownie."; the conflict
   says to check the current data and try again; the denial says to ask the club administrator. Empty states:
   today's list and the rentals list point to entering a phone rental (the "New rental" button / Rentals tab).
   Load errors already offer a retry or the first place, unchanged.
8. **M-16** empty state: the next action does not exist for a guardian, so it says so plainly, as in the README:
   "When the club opens a kit order, you will find it here" (choice recorded against E09-S10 in the PR).
9. Tests that hard-coded the old texts now read them from the catalogs: `E08-S06-facility-day.spec.ts`
   (`uiText`) and `TEST-047-member-locale.spec.ts` (`uiTextIn` prefix of the birth-date label).

## Files changed

- `packages/app/src/i18n/{pl,en}.json`
- `packages/app/src/modules/payments/i18n/{pl,en}.json`, `components/orders/OrderCampaignForm.tsx`,
  `components/club/PaymentsClubFrame.tsx`, `components/club/orders/ClubOrderPage.tsx`, `ClubOrdersPage.tsx`
- `packages/app/src/modules/people/i18n/{pl,en}.json`
- `packages/app/src/modules/facilities/i18n/{pl,en}.json`
- `packages/app/.ai/qa/tests/facilities/E08-S06-facility-day.spec.ts`,
  `packages/app/.ai/qa/tests/people/TEST-047-member-locale.spec.ts`

## Commands and results

- `yarn verify`: first run passed generate, typecheck, typecheck:packages, typecheck:qa and lint, then failed at
  `format:check` (`E08-S06-facility-day.spec.ts` and `ClubOrdersPage.tsx` not formatted). After `yarn format`,
  `yarn verify --from format:check` passed every remaining step (format:check … build); `yarn typecheck:qa` re-run
  on the final test edits: exit 0.
- `yarn test:integration:vereino --filter E08-S06`: `1 passed (41.1s)`.
- `node scripts/vereino-ephemeral.mjs test --filter TEST-047 --no-build`: `2 passed (47.2s)`.
- Browser evidence: a temporary spec (not committed) on the same production build captured 64 screenshots — login
  error, M-02, M-08 error (`/api/people/me` forced to 500), M-16, B-30, B-31, M-12 today and rentals — in pl and en,
  375 and 1440 px, light and dark; Cezar asset `issue-496-evidence.html`. Console errors: only the deliberate 401 of
  the wrong password and the injected 500s. Its first English pass failed with 401 on `PUT` club settings: the admin
  token had been ended by `signInBrowser` (lesson `sign-in-browser-ends-the-api-token`); fixed by taking a fresh token.

## Review round 1 (independent reviewer, changes requested)

- Important: the M-12 empty day pointed every user to the Rentals tab, which only `facilities.rentals.manage` shows.
  Fix: `facilities.facility.entries.empty` is plain again ("Na obiekcie nic dziś nie zaplanowano."); the new
  `facilities.facility.entries.emptyRentals` carries the hint and `FacilityDay` uses it only when `noShow` (the
  Rentals tab) is granted. E08-S06 (administrator) expects `emptyRentals`.
- `yarn verify`: all 18 steps passed. `yarn test:integration:vereino --filter E08-S06`: `1 passed` (at 11:25 the test
  books an evening rental, so its empty branch did not run). A temporary spec (not committed) on the same build
  checked both branches at 375 px: administrator → `emptyRentals`; `feature-check` answered without
  `facilities.rentals.manage` → no tabs and the plain text: `1 passed`; screenshots in the Cezar assets.
- Minor findings (screenshots attached to GitHub, stale `ClubRentalsTab.tsx` header comment) left for the reviewer's
  call: the review round fixes Blocking and Important findings only.

## Open problems / next steps

- None for this issue. The M-12 "Rentals" tab trigger looks clipped at 375 px in the screenshots (pre-existing, not
  part of this issue).
