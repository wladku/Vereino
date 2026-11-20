# Run: E20-S04 — Today and the session page without 403/404 calls or an English "Access denied" toast (#483)

- **Trigger:** Cezar run `c22f86c0` (`om-auto-fix-issue 483`, label `cezar`), 2026-11-20.
- **Issue:** #483 (epic #479, owner decision 7). **Branch:** `fix/issue-483-staff-guardian-today-access`.
- **Spec gate:** `direct` (bug fix; no new contract).

## Root cause

1. **The English "admin" toast.** `ClubCoachPaymentsWidget` (`payments/widgets/injection/club-coach-payments`) called
   `GET /api/payments/group-charges` for everyone on `/club`; a guardian or attendant has no `payments.groups.view`, so
   the route answered 403. The widget sent `x-om-forbidden-redirect: 0`, so `apiFetch` itself stayed quiet, but its own
   `CoachTileLoadError` carried a `status` property: the platform `QueryProvider`'s global `QueryCache.onError` treats any
   error with `status === 403` as a refusal and calls `notifyForbiddenAccess()` without hints, which writes the hard-coded
   English text with the default role "admin" (`@open-mercato/ui/src/backend/utils/api.ts` `formatForbiddenAccessMessage`).
2. **403 `/api/payments/my-orders`** for the coach, coordinator and attendant: the order tile read the caller's own
   campaigns for anyone; the R10 payments gate refuses staff without `payments.view_own` (`scope_denied`) or a person.
3. **404 `/api/activities/calendar/{id}?as=self`** on M-04: the session page always made the member read, even for
   staff with no wards and no participant membership, whose own calendar can hold no session.
4. **403 `?as=coach` on the edit form:** opened without `?as=coordinator`, the form always read as the coach, which a
   coordinator who coaches nothing is refused.

## Changes

- `activities/lib/member-session.ts`: `sessionPerspectives` returns `member: null` for staff without a member side
  unless the link asks for `self`/`guardian`; unit tests extended (`member-session.test.ts`).
- `ClubSessionPage.tsx`: the member read runs only when `member !== null`.
- `ClubSessionEditPage.tsx`: without `?as=`, the staff perspective comes from the profile (a coordinator who does not
  coach reads as the coordinator).
- `club-coach-payments/widget.client.tsx`: the platform feature check (`payments.groups.view`) runs before the read; the
  load error keeps its HTTP status in `httpStatus`, so the global 403 handler raises no toast for a hidden tile.
- `club-today-order/widget.client.tsx`: the read runs only when the spot context's profile says `paymentsVisible`.
- `PlatformFlashTranslator` (new, `packages/app/src/components/`) + `lib/platform-flash.ts` (+ unit test): a capture-phase
  `flash` listener (added once at module load) rewrites the platform's English-only toasts (access denied ×3 variants, session expired) to
  `vereino.flash.*` keys in the page language; mounted in `AppProviders.tsx` (new local-patch row in `CONTRIBUTING.md`,
  changelog file for the engineering standards spec). Keys added to `src/i18n/{en,pl,de,es,ko}.json`.
- Integration test `people/ISSUE-483-today-and-session-without-refusals.spec.ts`: guardian, attendant, treasurer on
  `/club` (pl 375 px, en 1440 px) — 0 same-origin 4xx, no toast, no coach tile; a real refusal raises the toast in pl and
  en; coach and coordinator on `/club`, `/club/occurrences/{id}` and its edit form — 0 4xx (coach keeps the tile).

## Decisions

- Gate on the client (feature check / profile flag) rather than turning the routes' 403 into 200: the routes' documented
  errors stay as they are (no contract change), and the member profile already carries `paymentsVisible`.
- Translate the platform toast on the Vereino side by rewriting the `flash` event in the capture phase (no ejection, no
  `node_modules` edit) — owner decision 7 of epic #479. The "requires the role \"admin\"" variant becomes the plain
  "no permission" text, since the default role says nothing true to a club member.

## Upstream report draft (Open Mercato, for E20-S18)

> **Title:** `apiFetch`/`QueryProvider` access-denied and session-expired toasts are English-only and name a default role
>
> `@open-mercato/ui` 0.9.0 `backend/utils/api.ts` builds the toasts in `formatForbiddenAccessMessage` and
> `redirectToSessionRefresh` from hard-coded English strings, so a Polish (or any non-English) UI shows
> "Access denied: this area requires the role "admin". Contact your administrator." The `QueryCache.onError` fallback in
> `theme/QueryProvider.tsx` calls `notifyForbiddenAccess()` without hints for any error whose `status` is 403, so the
> message names the default role `admin` even when the refused route required a feature. Expected: the texts come from
> the i18n catalog (e.g. `ui.access.denied.feature`, `ui.access.denied.generic`, `ui.session.expired`) and the fallback
> does not invent a role. Workaround in Vereino: a capture-phase `flash` listener that rewrites the known texts.

## Commands and results

- `yarn generate` — ok.
- `yarn verify` — first run failed at `lint` (6 errors in the new spec: `restrict-template-expressions` on numbers,
  `no-unnecessary-type-conversion`), then `format:check` (3 files); fixed, final full run: every step pass.
- `yarn test:integration:vereino --filter ISSUE-483` — `1 passed (57.7s)` on the final code.
- The same test against the old pages and widgets (fix files reverted to `HEAD` for one run): fails with
  `guardian on /club (pl, 375 px)` → `"GET /api/payments/group-charges 403"`, so it guards the bug.
- A screenshot run failed once in the "en" pass of the refusal toast: the member frame rewrote the locale cookie to the
  club default (pl) and called `router.refresh()` while the probe fetch ran, and the toast showed the platform's English
  text. Two changes: the translator's `flash` listener is now added once when the module loads (never removed, the
  component only hands over the current `t`), and the test sets the club's default locale with the cookie and asserts
  `html[lang]`, so every "en" pass really renders English. Reruns: pass (with screenshots), pass (clean).

## Open problems / next steps

- Remove `PlatformFlashTranslator` once Open Mercato ships translated toasts (E20-S18 files the upstream report).
- A coach who is also an adult participant in another group still makes the `as=self` read on a staff-only session
  (404); the profile cannot tell which groups the member side covers without another read.
