# Run: #876 — members change their password in the phone app

- **Goal and trigger:** Cezar run `daf56d24` (`om-auto-fix-issue 876`), unattended. Owner request: build per the defaults applied on the issue and put `needs-qa` on the PR so the owner reviews them.
- **Issue:** #876 (bug, priority-medium, risk-high). **Branch:** `fix/issue-876-member-change-password` (renamed from `cez/876`).
- **Spec:** no covering spec; UI row `/club/profile` of `.ai/specs/2026-10-20-vereino-club-management.md` updated, changelog `changelog/2026-10-20-vereino-club-management/2026-11-27-issue-876-member-password-page.md`; people README M-10.

## Steps

1. Claimed #876 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch). #809 (#737) and #831 (#736) were already merged, as the issue asked.
2. Verified the save route: the platform's `PUT /api/auth/profile` (app override `src/app/api/auth/profile/route.ts`, #779) has `requireAuth` only — no backend feature — and TEST-737 already calls it with a member token, so no new `foundation` route was needed (the issue's hypothesis 1 answered "a member may call it").
3. Built `/club/profile/password` (`people/frontend/club/profile/password`, `ClubPasswordPage.tsx`) in the member layout (`ClubFrame`): three labelled password inputs, the server policy as the hint and client check (`getPasswordPolicy`/`buildPasswordSchema`, filled by `PasswordPolicyBridge`), `ErrorSummary` + field messages, focus on the first field to fix, sticky 44 px save bar. Success returns to `/club/profile?password=changed`, which shows a status message and drops the marker from the address.
4. Pure logic in `people/lib/password-change.ts` (form checks, reading the server answer, the marker) and `panelPasswordRedirect` in `member-rules.ts`, 100 % unit coverage.
5. Q1 (default applied): backend page middleware `people.member-password-page` on `/backend/profile/change-password` sends a member (linked person with `people.self`) to `/club/profile/password`; staff with a `club_admin` or `treasurer` grant (the panel grants of `memberLanding`) and users linked to no person keep the panel page. Fails open to the panel page (it still changes the password).
6. `CHANGE_PASSWORD_HREF` now re-exports `MEMBER_PASSWORD_HREF`; E06-S22 updated to the new URL; integration test `ISSUE-876` added.

## Decisions

- **Password-check messages from the client catalog.** The 422 codes of the #779 check (`password_*`) are shown with `foundation.errors.<code>` in the page's language, not the server's text: the server translates for the request locale, which need not be the member's chosen language. An unknown `password_*` code still shows the server's text.
- **Success message by query marker, not a flash toast:** the toast lasts seconds and is not reliably read after navigation; a status region on the profile is.
- **The changing device stays signed in.** First run of ISSUE-876 failed: after a valid change the member landed on `/login?redirect=%2Fclub%2Fprofile`. Cause: the platform's `auth.users.update` deletes every session of a user whose password changes (`nativeDelete(Session)`), and `PUT /api/auth/profile` then signs a JWT naming the deleted session. The app's wrapper `src/app/api/auth/profile/route.ts` now reads the auth before the platform handler and, after a 200 with a new password, issues a fresh session for this device through `foundation`'s `renewOwnSession` (the #736 `issueUserSession`, no "remember me"; staff get the staff idle timeout). Every other session stays ended. This also applies to the panel page (the administrator was signed out there too); flagged for the owner on the PR.
- **Only `/backend/profile/change-password` redirects**, not `/backend/auth/profile` (it also carries the e-mail change, out of scope).

## Files changed

See the PR diff: `people/{backend/middleware.ts, components/club/ClubPasswordPage.tsx, components/club/ClubProfilePage.tsx, components/club/member-client.ts, frontend/club/profile/password/*, i18n/{en,pl}.json, lib/password-change.ts, lib/member-rules.ts, lib/__tests__/*, services/member-landing.ts, README.md}`, `.ai/qa/tests/people/{ISSUE-876-member-password-page, E06-S22-profile-wards-guardians}.spec.ts`, the spec row and changelog file.

## Commands and results

- `npx jest people/lib/__tests__/{password-change,member-rules}.test.ts --coverage`: 100 % lines/branches/functions on both files.
- `yarn generate`: ok; `yarn typecheck`: exit 0.
- `yarn test:integration:vereino --filter ISSUE-876`: run 1 failed — `Expected pattern: /\/club\/profile$/ Received string: "http://127.0.0.1:5217/login?redirect=%2Fclub%2Fprofile"` (own session ended, see Decisions); run 2 passed (1 passed, 1.1m); run 3, after the lint fix, failed — `Received string: "http://127.0.0.1:5964/club/profile?password=changed"` (the notice read `window.location` before the client navigation updated it; fixed with `useSearchParams`); run 4 passed (1 passed, 1.1m).
- `--filter E06-S22`, `TEST-PW01`, `TEST-PW02`, `TEST-737`: each 1 passed.
- `yarn verify`: first pass failed at `lint` (`react-hooks` "Calling setState synchronously within an effect", `ClubProfilePage.tsx`), then `secrets:check` (literal values next to `password` keys, false positives — moved into constants, no allowlist entry) and `format:check` (3 files, `yarn format`); final full run: all 24 steps passed.
- `yarn guard`: no blocking findings. `yarn lessons:check`: ok (new lesson `own-password-change-ends-own-session`).

## Open problems / next steps

- Owner reviews the Q1 default on the PR (`needs-qa`).
