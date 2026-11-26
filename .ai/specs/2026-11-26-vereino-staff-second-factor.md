# Vereino staff second factor — Google sign-in or an e-mail code for administrators and treasurers

**Date**: 2026-11-26
**Status**: Draft

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources:
- Story E25-S02 (#736, epic #734) and the owner's decision on it of 2026-11-26. ENG-Q-09 was revisited: option 1, Google sign-in for staff; password plus an e-mail code as the fallback; coordinators and coaches not required for now; recovery by a club administrator, or by the operator for the last administrator.
- The engineering standards (`2026-10-21-engineering-standards-and-patterns.md`: S8.2, ADR-023, ENG-Q-09, ENG-Q-12).
- The social sign-in spec (`2026-10-27-vereino-social-sign-in.md`: DD-S01…DD-S07, the identity routes, `vereino_identity_links`).
- The club management spec (roles and features table, DD-33).
- `docs/compliance/asvs-checklist.md` and `asvs-requirements.md` (V6.3.3, V6.4.4, V6.5, V6.6, V6.8.4).
- Vereino's login wrapper `src/app/api/auth/login/route.ts` (#738).
- The installed `@open-mercato/*` 0.9.0 packages:
  - `core/modules/auth/api/login.ts`;
  - `core/modules/auth/api/session/refresh.ts`;
  - `core/modules/auth/lib/sessionIntegrity.ts`;
  - `shared/lib/auth/{jwt.ts,server.ts,mfaPendingAccess.ts}`;
  - `shared/lib/crud/{api-interceptor.ts,interceptor-runner.ts}`;
  - `core/helpers/integration/api.ts`.
- A fresh-context architectural review of 2026-11-26 (run log `.ai/runs/2026-11-26-issue-736-staff-second-factor-spec.md`).

Paths `src/...` are relative to `packages/app/`; `@om/*` means `packages/app/node_modules/@open-mercato/*/src`.

## TLDR

A club administrator or treasurer can no longer reach the back office with a password alone. A staff member with a connected Google account signs in with Google (#566), and the Google account carries the second factor. A staff member without one signs in with the password and then a six-digit code e-mailed to the account's address. Coordinators, coaches, guardians and members sign in as today. The requirement is an ACL feature, `foundation.second_factor.required`, seeded on `vereino_club_admin` and `vereino_treasurer`, so no code checks a role name.

The gate sits in the login wrapper Vereino already has (#738). After a correct password it replaces the platform's full session cookies with a provisional `mfa_pending` token for the same platform session. The installed open-source platform already refuses such a token everywhere except the completion routes an app registers (a seam built for the commercial MFA module). No new table, no migration and no dependency. A lost factor is reset by a club administrator, or from the shell by the operator for the last administrator.

## Problem Statement

ENG-Q-09 accepted "no MFA in 1.0" for a single club and said to revisit it before multi-club hosting. D-034 makes that moment now: one instance will hold the data of many clubs, children's data included, and a phished administrator password exposes a whole club. ASVS 5.0 level 2 expects a second factor for administrators (V6.3.3, listed as a **gap** in `docs/compliance/asvs-checklist.md`). The platform's MFA lives in the commercial enterprise `security` module, which ADR-023 keeps out and ENG-Q-10 removed from the image. On 2026-11-26 (#736) the owner chose the cheapest option: Google sign-in, which is already built, with an e-mail code as the fallback.

## Overview and Success Measures

- **Primary outcome:** no session usable on a staff page or API is issued to a user holding `foundation.second_factor.required` without Google or a correct e-mail code (TEST-2F01, TEST-2F03).
- **Leading indicators:**
  - staff sign-ins through Google against the e-mail code (`foundation.second_factor.verified` vs `foundation.identity.signed_in`);
  - zero `foundation.second_factor.unavailable` fingerprints in a week of staging use;
  - resets per month (each one is a support case).
- **Baseline:** every staff sign-in is a password, or Google for those who connected it.
- **Market / product reference:**
  - Adopted, as the owner's fallback with Google preferred: GitHub, Slack and Google Workspace send e-mail verification codes (six digits, about 10 to 15 minutes, a handful of attempts). NIST SP 800-63B §5.1.3 restricts e-mail as an out-of-band channel.
  - Rejected: SMS (V6.6.1, cost, SIM swap); TOTP and passkeys (option 2, a spec of its own); the enterprise `security` module (option 3, licence).

## Goals

- **REQ-2F01** (Must) — A user holding `foundation.second_factor.required` who signs in with a password gets no usable session until they enter a single-use code e-mailed to the account's address. Until then every staff API, page and the session refresh refuse them.
- **REQ-2F02** (Must) — Google sign-in (#566) satisfies the requirement; no other social provider does. A required user with a connected Google identity must use it: password sign-in is refused with a pointer to the Google button.
- **REQ-2F03** (Must) — The requirement covers the club administrator and the treasurer, and nobody else by default. A user who gains it during a session is signed out. Coordinators, coaches, guardians, members and payers sign in unchanged.
- **REQ-2F04** (Must) — Recovery: a club administrator, after verifying the person, resets another staff member's second factor. The reset unlinks their social identities, ends their sessions and is audited with a note. The operator does the same from the shell for the last administrator.
- **REQ-2F05** (Must) — The challenge fails closed. If the code store, the lock or the e-mail send is down, no session is issued. Codes are hashed, expire, are single use and are attempt-limited per challenge and per user.

## Non-goals

- A second factor for guardians, members, payers, coordinators or coaches. The issue puts it out of scope, and for coordinators and coaches the owner said "for now".
- TOTP, passkeys, SMS or recovery codes (ENG-Q-09 options 2 and 3). A later spec can add one as another `secondFactor.method` without changing the challenge contract.
- Checking whether the Google account itself has 2-Step Verification on (Q-2F04).
- A "remember this device" option. Session lifetime and "remember me" stay with ENG-Q-12 (#737).
- The platform super-admin (the operator's account): Q-2F02.

## Proposed Solution

The installed open-source core carries a provider-neutral MFA-pending gate (platform contract SPEC-ENT-007, amendment 2026-08-21; V-2F01). A JWT with `mfa_pending: true` (and no `mfa_verified: true`) is provisional:
- `shared/lib/auth/server.ts` resolves it to no auth on every page, and on every API route except the method and path pairs registered with `registerMfaPendingAccessRoutes`;
- `session/refresh.ts` refuses to mint a full token for a browser that holds one;
- on a registered route, the platform resolves it through the canonical session check, which needs a live `sid` (`sessionIntegrity.ts`).

Vereino adds one slice to the `foundation` module, `src/modules/foundation/second-factor/**`, with five parts.

**1. The gate in the login wrapper.** It lives in `src/app/api/auth/login/route.ts`, the app route that already wraps the platform's login handler for the per-account limit (#738). The wrapper sees the platform's real `Response`, so it can set the status, body and cookies. A login after-interceptor cannot: its result is only `merge`/`replace` of the body, and a body without `token` makes `login.ts` set the original full token (lesson `core-auth-ships-an-mfa-pending-gate`). After a 200 from the platform the wrapper:
- reads `sub`, `sid`, `tenantId` and `orgId` from the token it just received;
- asks `rbacService` whether the user holds `foundation.second_factor.required`. If not, the response passes unchanged.
- If yes, it builds a new response. That response never carries the platform's `Set-Cookie` headers or `refreshToken`.
  - (phase 2) The user has a Google identity link: 403 `second_factor_use_google`, and the platform session is deleted.
  - Otherwise: a challenge for the platform's session (`sid`), a provisional token for that same `sid`, `auth_token` set to it, `session_token` cleared, and the challenge page as `redirect`.

**2. The challenge** is a single-use marker in the platform cache (the state-marker pattern of DD-S04) and holds the hashed code, attempts, resends and expiry. Read-modify-write runs under a Postgres advisory lock on the challenge (DD-2F08). There is no table.

**3. Two completion routes, `verify` and `resend`,** registered as MFA-pending routes. On success `verify` deletes the provisional session and issues a fresh full one through a session issuer without a link. That issuer is extracted from `issueSession` of `services/identity.ts` and serves both Google sign-in and this route.

**4. A public page `/login/second-factor`** for the code.

**5. The reset:** a command, an action on the person record and a shell CLI.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-2F01** The gate lives in Vereino's existing login wrapper (`src/app/api/auth/login/route.ts`, #738), on top of the installed `mfa_pending` gate (V-2F01) | the wrapper already shadows the platform route and sees the final `Response`, so it can refuse with a status and control every cookie; the platform gate already refuses a provisional token on pages, unregistered API routes and refresh | an API after-interceptor on `auth/login`; a check in `src/proxy.ts`; a check in each backend layout | an after-interceptor cannot set a status, and a body without `token` leaks the full cookies (`interceptor-runner.ts:244-277`, `login.ts:234-253`); the Edge proxy cannot read the database; per-layout checks miss API routes |
| **DD-2F02** Requirement = ACL feature `foundation.second_factor.required`, seeded on `vereino_club_admin` and `vereino_treasurer` in `catalogueRoleFeatures()` and checked wildcard-aware through `rbacService.userHasAllFeatures` | AGENTS.md forbids role-name guards; a person who is both coordinator and treasurer is covered by the treasurer grant; adding coordinators later is a catalogue change, not code | role names; a per-user flag column | role-name guard; a column needs a migration and drifts from the role assignment |
| **DD-2F03** The provisional token keeps the platform's own session: `signJwt({ sub, sid, tenantId, orgId, email, roles, mfa_pending: true, vereino_2f: challengeId }, 600 s)`; the platform's refresh token never reaches the browser; `verify` deletes that session and creates a fresh one | the canonical check on a registered route needs a live `sid` (`sessionIntegrity.ts:56-66`); a session whose refresh token was never sent cannot be refreshed; deleting it on success, on the 5th wrong code and on expiry (the next sign-in) leaves nothing usable | a token without `sid`; `requireAuth: false` routes that verify the cookie themselves | the first never authenticates on a registered route; the second re-implements the platform's token check |
| **DD-2F04** Challenge state in the platform cache, never a table: key `foundation:second-factor:<sha256(challengeId)>`, value `{ userId, sessionId, tenantId, organizationId, codeHash, attempts, resends, lastSentAt, remember, redirect }`, TTL 10 minutes | a 10-minute value, like the OAuth state (DD-S04); replicas share it with `CACHE_STRATEGY=redis` (already required) | a `foundation_second_factor_challenges` table | a table and a migration for short-lived values |
| **DD-2F05** Code: 6 digits from `crypto.randomInt`, stored as HMAC-SHA256 keyed with the challenge id (32 random bytes, only in the provisional token), compared in constant time; 10-minute lifetime; 5 wrong attempts end the challenge and delete its session; at most 3 resends, 60 s apart, each replacing the code; at most 5 challenges per user per hour | V6.5.1–V6.5.5, V6.6.3; an attacker with the password gets 5 guesses per challenge and at most 25 per hour | 8 characters; unlimited resends; no per-user cap | 6 digits is typeable and the caps bound guessing to about 2.5 × 10⁻⁵ per hour; unlimited resends turn the route into a mail cannon; without a per-user cap each correct password buys 5 fresh guesses |
| **DD-2F06** A required user with a Google identity link must use Google: password sign-in is refused (403 `second_factor_use_google`) and the platform session is deleted (owner's decision "must sign in with Google"; Q-2F01). The identity callback refuses every provider other than Google for a required user | the stronger factor wins; an attacker with the password cannot fall back to the e-mail code; Facebook (`IDENTITY_PROVIDERS` in `foundation/lib/identity.ts`) is not a factor the owner accepted | allow password + e-mail code as a second path; accept any linked provider | the e-mail code would become the attack path; Facebook was not decided as a staff factor |
| **DD-2F07** Recovery = the command `foundation.second_factor.reset`. It unlinks the person's identity links, ends all their sessions (`AuthService.deleteAllUserSessions`) and records who reset whom with a required verification note in the command log. An administrator may not reset themselves. The operator runs the same command from the shell (`yarn mercato foundation second-factor reset`). When the person holds the requirement, unlinking their Google link through `foundation.identity.manage` goes through this command | the owner's decision; after a reset the person signs in with password + e-mail code and may connect Google again; a person without a password gets one through the existing account actions (password reset link) | a "skip the factor once" token; self-service reset by e-mail; the plain unlink as the reset | a bypass token is weaker than the factor; self-service through the fallback's own mailbox adds nothing; the plain unlink has no note and ends no session |
| **DD-2F08** Attempts, resends and the per-user hourly cap are counted under `pg_advisory_xact_lock` keyed on the challenge (and on the user for the hourly cap), the pattern of `lockUserRoleSync` | parallel guesses must not exceed the cap; the platform cache has no atomic increment contract | cache read-then-write | a race lets parallel requests pass the cap |
| **DD-2F09** No off switch and no test bypass: integration fixtures complete the e-mail code from the `OM_TEST_MODE` e-mail capture | a variable that turns the requirement off would be one misconfiguration from no MFA in production | `VEREINO_STAFF_SECOND_FACTOR=off`; a fixed code in test mode | both put a bypass into production code |
| **DD-2F10** Gaining the requirement ends the user's sessions: when `syncAuthRoles` writes a role set that grants `foundation.second_factor.required` to a user who did not hold it, it calls `deleteAllUserSessions` after the write commits | a session and a 30-day refresh token issued before the role was granted were never challenged | challenge on the next sign-in only | the old session would run up to `REMEMBER_ME_DAYS` |

## Domain Vocabulary and Business Rules

| Term | Definition | Owner | Rule / failure |
|---|---|---|---|
| Second-factor requirement | holding `foundation.second_factor.required` in the user's tenant and organization | `foundation` | checked at every password sign-in and every social sign-in; gaining it ends sessions (DD-2F10); losing it applies at the next sign-in |
| Challenge | one pending sign-in of a required user: a cache marker plus the provisional token and its platform session | `foundation` | one challenge per provisional token; a new password sign-in starts a new one; 5 per user per hour |
| Code | six digits e-mailed to the account's address | `foundation` | valid 10 minutes, single use, 5 wrong attempts end the challenge, replaced by a resend |
| Provisional token | the platform JWT with `mfa_pending: true`, the platform session's `sid` and the claim `vereino_2f` (the challenge id) | platform format, `foundation` claim | accepted only by the two completion routes; expires in 10 minutes |
| Reset | removal of a person's identity links and sessions by an administrator or the operator | `foundation` | never on oneself; requires a verification note; audited |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator, treasurer | sign in with Google; or password + e-mail code | their tenant and organization from the token the platform just issued, never the request | `foundation.second_factor.required` (seeded on `vereino_club_admin` and `vereino_treasurer`) |
| Club administrator | reset another person's second factor | `club_admin` through `authorizeScoped` | `foundation.second_factor.reset` (seeded on `vereino_club_admin`) |
| Operator (shell) | reset any user's second factor in a named tenant and organization | shell only, never from a request; the arguments name the scope | — |
| Coordinator, coach, guardian, member, payer | sign in as today | unchanged | — |
| Platform super-admin | sign in as today (Q-2F02, an accepted risk) | unchanged | — |

`vereino_club_admin` gets the module wildcards of DD-33 plus the two new exact features. No Vereino role holds `api_keys.*`, so no required user can create an API key that skips the sign-in. A catalogue unit test asserts this. `OM_AUTOLOGIN_*` stays forbidden in production (`docs/ops/deploy.md`); the deploy check gains a line for it.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Installed seam | Why |
|---|---|---|---|
| Intercept the password sign-in | extend the Vereino local patch | `src/app/api/auth/login/route.ts` wrapping the platform `POST` (#738) | DD-2F01 |
| Refuse the provisional token everywhere else | reuse | `isMfaPendingJwtPayload`, `isMfaPendingAccessAllowed`, `registerMfaPendingAccessRoutes`, `session/refresh.ts`, `sessionIntegrity.ts` | the platform's own fail-closed gate |
| Session after the code | refactor + reuse | a link-free issuer extracted from `issueSession` (`services/identity.ts`; `AuthService.createSession` + `signJwt`, cookies as `autologin.ts`, a `remember` option) | Google sign-in and this route issue sessions the same way |
| Challenge marker | reuse pattern | platform cache, as the OAuth state (DD-S04) | no table |
| Counting | reuse pattern | `pg_advisory_xact_lock` (as `lockUserRoleSync` in `foundation/data/queries.ts`) | DD-2F08 |
| Code e-mail | reuse | `foundation/services/email-sender.ts` + `email-templates.ts`, sent synchronously (not the dispatch queue) | the person is waiting on the page |
| Requirement and reset permission | app-own features | `acl.ts`, `catalogueRoleFeatures()` in `@vereino/core`, `yarn mercato auth sync-role-acls` | DD-2F02 |
| Session end on gaining the requirement | extend | `syncAuthRoles` in `foundation/services/roles.ts` | DD-2F10 |
| Reset | extend | `foundation.identity.unlink` internals, `AuthService.deleteAllUserSessions`, command log | DD-2F07 |
| Rate limits | reuse | `metadata.rateLimit` per IP on `verify` and `resend`; the platform's and Vereino's sign-in limits, except that a provisional answer does not clear the account counter | M2 of the review |
| Integration fixtures | app-own wrapper | `_fixtures/auth.ts` `getAuthToken` with the platform helper's signature, completing the code from `capturedTo` | DD-2F09 |

## Architecture and Data Flow

```text
/login ── POST /api/auth/login  (Vereino wrapper, #738)
   ├─ account limit (withAccountEmailLimit) ── platform login.ts: password, limits, createSession(sid), signJwt, member-landing redirect
   └─ second-factor gate (on the platform's 200 Response)
        ├─ user lacks foundation.second_factor.required, or is super-admin (Q-2F02) → platform response unchanged; account counter cleared
        ├─ [phase 2] user has a Google identity link → delete session sid; 403 second_factor_use_google; no cookies
        └─ else, under the user lock: hourly cap (5) → 429 second_factor_challenges_limited, delete sid
                challengeId = 32 random bytes; code = randomInt(0, 10^6)
                cache.set(key(challengeId), {sessionId: sid, codeHash, …}, 10 min)  ── store down → delete sid; 503 second_factor_unavailable
                send code e-mail to user.email (account locale)                      ── send fails → delete marker and sid; 503
                200 { ok: true, token: signJwt({…claims, sid, mfa_pending: true, vereino_2f}, 600 s),
                      redirect: /login/second-factor, secondFactor: { method: 'email_code', expiresAt, emailHint } }
                Set-Cookie auth_token = provisional token; session_token cleared; platform cookies and refreshToken dropped
                account counter NOT cleared
/login/second-factor ── POST /api/foundation/second-factor/verify { code }   [registered MFA-pending route; canonical auth via sid]
     under the challenge lock:
     ├─ not provisional / no vereino_2f / marker missing or not matching sub, sid, scope → 401 second_factor_challenge_expired (cookies cleared)
     ├─ wrong code → attempts+1 → 400 second_factor_code_invalid { attemptsLeft }; 5th → marker + sid deleted, foundation.second_factor.locked, 401
     └─ right code → marker deleted → session sid deleted → issueStaffSession(user, remember) → full auth_token + session_token
                     → foundation.second_factor.verified → 200 { ok, redirect }
                  ── POST /api/foundation/second-factor/resend [registered] → new code, resends+1; 429 second_factor_resend_limited
Google: /api/foundation/identity/google/callback → session (satisfies REQ-2F02)
Other provider (facebook) for a required user → /login?second_factor=use_google, no session
syncAuthRoles grants a role holding the requirement → deleteAllUserSessions(user) after commit
/backend/people/persons/[id] "Sign-in methods" → POST /api/foundation/second-factor/reset { userId, note }
     → command foundation.second_factor.reset → unlink links, deleteAllUserSessions → foundation.second_factor.reset
shell: yarn mercato foundation second-factor reset --tenant --org --email --note
```

- **Boundaries:** the slice lives in `src/modules/foundation/second-factor/**`, apart from these files:
  - Module-level files that discovery needs: `api/second-factor/{verify,resend,reset}/route.ts`, `frontend/login/second-factor/page.tsx`, the features in `acl.ts`, the error rows in `lib/error-codes.ts`, the events in `events.ts`, the CLI in `cli.ts`, and the MFA-pending route registration (V-2F02).
  - The gate itself is exported from `@/modules/foundation` (`index.ts`) and called by the wrapper route.
  - Pure logic sits in `src/modules/foundation/lib/second-factor.ts`: code generation and hashing, attempt, resend and cap rules, e-mail hint masking.
- **Scope:** the gate takes the tenant and organization from the token the platform just issued, never from the request body. The completion routes take them from the provisional token, and the marker must match its `sub`, `sid`, tenant and organization.
- **Compatibility:**
  - Additive change: the login response keeps its shape (`ok`, `token`, `redirect`) and gains the optional `secondFactor` object. The new error statuses apply only to users who hold the requirement.
  - The new routes, features, error codes, events and CLI are protected from first deployment (`BACKWARD_COMPATIBILITY.md` §2, §4, §5, §8).
  - The wrapper is a Vereino local patch (#738).
  - The `mfa_pending` gate is a platform contract (`.ai/guides/upstream/BACKWARD_COMPATIBILITY.md`). TEST-2F01 fails on a platform upgrade that changes it.

## User Journeys

### Journey J-2F01 — The treasurer without Google signs in (phase 1)

1. Ewa enters her e-mail and password on `/login`. The gate opens a challenge and sends "Your Vereino sign-in code: 482 913". The browser lands on `/login/second-factor`: "We sent a code to e•••@klub.pl."
2. She types the code. `verify` issues her session and she lands on `/backend`. A second use of the same code fails.
3. Opening `/backend` in another tab before step 2 shows `/login`, because the provisional token resolves to no session.

### Journey J-2F02 — The administrator with Google (phase 2)

1. Marek connected Google in `/club/profile` (#566). He types his password on `/login` and is told "Your account signs in with Google. Use Sign in with Google." No session is issued.
2. He taps "Sign in with Google", the callback issues the session and he reaches `/backend`.

### Journey J-2F03 — The treasurer loses her mailbox or her Google account (phase 1)

1. Ewa calls Marek. He checks it is her (a call back to the number on her person record). If her address changed, he corrects it in her account. Then he opens her person record → "Sign-in methods" → "Reset second factor", types the note "phoned back 2026-12-03" and confirms.
2. Her identity links are removed and her sessions end. She signs in with password and e-mail code, and may connect her new Google account in the profile.
3. If Marek is the last administrator, the operator verifies him by the operator's own procedure and runs `yarn mercato foundation second-factor reset`.

### Journey J-2F04 — A coach signs in, then becomes treasurer (phase 1)

1. Tomek (coach) signs in with his password and lands on `/backend` with no code, as today.
2. Marek assigns him the treasurer role. The role sync ends Tomek's sessions. His next sign-in asks for the e-mail code.

## UI and Interaction Contracts

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/login/second-factor` (public frontend page, `foundation`) | enter the 6-digit code; "Send a new code"; "Back to sign-in" | `POST /api/foundation/second-factor/verify`, `POST …/resend` through the shared `apiCall` | `/login` and `/reset` of core `auth` (`frontend/login.tsx`, `frontend/reset.tsx`): same centred card | the auth page card layout, `Input` (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength=6`), `Button`, `Alert` | submitting; wrong code (attempts left); expired → `/login` with a sentence; resend limited (wait time); unavailable (503) with retry; success redirect | REQ-2F01, REQ-2F05 |
| `/login` | a refused sign-in shows a sentence in the platform's error area. 403 `second_factor_use_google` (phase 2): "Your account signs in with Google. Use Sign in with Google." 429 and 503 get a sentence each. `?second_factor=expired|use_google` adds the same sentences above the form. | the platform login page renders `error` of a non-OK response (`login.tsx`); the `?second_factor=` sentence goes into the social sign-in widget's message area on `auth.login:form` | `/login` | none new | the sentences, with the Google button below | REQ-2F01, REQ-2F02 |
| `/backend/people/persons/[id]` → "Sign-in methods" (social sign-in section) | "Reset second factor" for a person holding the requirement, with `foundation.second_factor.reset`; a dialog with a required note and an "I verified this person" checkbox | `POST /api/foundation/second-factor/reset` | the section's own "Unlink" action (social sign-in spec) | `CollapsibleSection`, `Button`, `useConfirmDialog` with a form body, `Textarea`, `Checkbox` | hidden without the feature, for oneself and for a person without the requirement; submitting; success flash "Second factor reset; sessions ended"; 404 | REQ-2F04 |
| `/club/profile` → "Connected accounts" (phase 2) | for a required user: "Your role signs in with Google, or with your password and an e-mail code. Turn on 2-Step Verification in your Google account." | `GET /api/foundation/identity/me` gains `secondFactorRequired` | the section itself | `Alert` (info) | shown only when required | REQ-2F02 |

```text
/login/second-factor
┌──────────────────────────────────────┐
│ Check your e-mail                    │
│ We sent a sign-in code to e•••@klub.pl│
│ Code  [ _ _ _ _ _ _ ]                │
│ ⓘ Wrong code. 3 attempts left.       │  (aria-live="polite")
│ [Sign in]                            │
│ Send a new code · Back to sign-in    │
└──────────────────────────────────────┘
```

- **Behavior:**
  - The code field accepts paste and strips spaces, and Enter submits.
  - "Send a new code" is disabled for 60 s after a send, with a visible countdown.
  - On expiry the page redirects to `/login?second_factor=expired`.
- **Responsive and accessibility:** full width at 375 px; controls ≥ 44 px; the field labelled; the status line in an `aria-live="polite"` region; focus on the field when the page loads.
- **Localization:** `foundation.secondFactor.*` keys in `src/modules/foundation/i18n/{en,pl}.json`, including the e-mail subject and body. The e-mail uses the account's locale, falling back to the club's.
- **Design-system and theming:** semantic tokens, light and dark, no hard-coded colours. The page and the `?second_factor=` sentences sit on the `/login` route family, so phase 1 checks `resolveClientBootstrapProfile` for both (lesson `club-routes-need-the-member-bootstrap-profile`).

## Data Models

N/A — no table and no migration:
- the challenge is a cache marker (DD-2F04);
- the reset deletes `vereino_identity_links` rows (as an unlink) and the platform `auth` sessions (through `AuthService`);
- audit lives in the command log and in the events.

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `POST` (Vereino wrapper of the platform route) | `/api/auth/login` | as the platform (`requireAuth: false`, platform and account limits) | as the platform | unchanged for users without the requirement; for a required user `200 { ok: true, token: <provisional>, redirect, secondFactor: { method: 'email_code', expiresAt, emailHint } }`, `foundation.second_factor.challenged` | 403 `second_factor_use_google` (phase 2); 429 `second_factor_challenges_limited`; 503 `second_factor_unavailable` — each after deleting the platform session and without its cookies | REQ-2F01, REQ-2F02, REQ-2F03, REQ-2F05 |
| `POST` | `/api/foundation/second-factor/verify` (custom route, registered MFA-pending) | a provisional token with a live `sid` whose `vereino_2f` matches a live marker; `metadata.rateLimit` 10/min/IP | `{ code: string /^\d{6}$/ }` | 200 `{ ok: true, redirect }` + session cookies; `foundation.second_factor.verified` | 400 `second_factor_code_invalid` `{ attemptsLeft }`; 401 `second_factor_challenge_expired` (cookies cleared; also after the 5th wrong code, with `foundation.second_factor.locked`); 503 `second_factor_unavailable` | REQ-2F01, REQ-2F05 |
| `POST` | `/api/foundation/second-factor/resend` (registered MFA-pending) | as `verify`; `metadata.rateLimit` 5/min/IP | — | 200 `{ ok: true, expiresAt, nextResendAt }` | 429 `second_factor_resend_limited` `{ nextResendAt }`; 401 `second_factor_challenge_expired`; 503 | REQ-2F01, REQ-2F05 |
| `POST` / `foundation.second_factor.reset` (platform `CommandHandler`; `authorizeScoped` with allowed kinds `['club_admin']`; `isUndoable: false` — the person reconnects Google) | `/api/foundation/second-factor/reset` | auth + `foundation.second_factor.reset` | `{ userId, note: string 3..500 }` | 200 `{ ok: true, unlinked: number, sessionsEnded: true }`; `foundation.second_factor.reset` | 403 `second_factor_reset_self`; 403 without the feature; 404 for an unknown user, another club's user or a user without the requirement (one answer); 422 validation | REQ-2F04 |
| CLI | `yarn mercato foundation second-factor reset --tenant <id> --org <id> --email <e-mail> --note <text>` | shell only | — | prints counts; same command with a system actor | unknown user → exit 1 "not found" | REQ-2F04 |
| CLI | `yarn mercato foundation second-factor end-sessions --tenant <id> --org <id>` | shell only, rollout | — | ends the sessions of every user in that scope holding the requirement | — | REQ-2F01 |

The identity callback (social sign-in spec) gains one branch. A required user signing in with a provider other than Google gets a 302 to `/login?second_factor=use_google`, with no session and the fingerprint `foundation.second_factor.provider_refused`.

Error codes join the module's one table (`src/modules/foundation/lib/error-codes.ts`, P-17): `second_factor_use_google` (403), `second_factor_unavailable` (503), `second_factor_challenges_limited` (429), `second_factor_code_invalid` (400), `second_factor_challenge_expired` (401), `second_factor_resend_limited` (429), `second_factor_reset_self` (403). The wrapper's errors carry a localized `error` sentence, because the platform login page displays `error`.

The completion and reset routes are custom (not `makeCrudRoute`), with per-method `metadata` and `openApi`. Each gets cross-club probes in `.ai/qa/tests/_fixtures/isolation/inventory/foundation.json`: the reset route answers a club B user id with 404.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `foundation.second_factor.challenged` / `verified` / `locked` / `reset` (payload: `userId`, `tenantId`, `organizationId`, `method`; for `reset` also `actorUserId`; ids only, S4.6) | `foundation` | `audit_logs` | audit entries; a later `communication` notice "your second factor was reset" can subscribe to `reset` | events are facts; no retry |
| code e-mail | the gate and `resend` | the person | — | sent synchronously with a 10 s timeout; a failure is a 503, never queued (the code would arrive after it expired) |
| role sync grants the requirement | `foundation/services/roles.ts` | — | `deleteAllUserSessions` after commit | a repeat finds no session |

No scheduled job.

## Security, Privacy, and Compliance

- **Authorization:** the requirement and the reset are features (DD-2F02); there is no role-name check. The completion routes accept only a provisional token with a live `sid` whose marker exists and matches its user, session, tenant and organization.
- **Tenant isolation:** there is no system-scope read.
  - The gate reads the user's features in the scope of the token the platform just issued.
  - The reset runs `authorizeScoped` (`club_admin`), so a club B user id answers 404.
  - The operator CLI is shell-only with an explicit scope.
- **Codes (V6.5, V6.6):** CSPRNG; 6 digits; HMAC-hashed with the challenge id; constant-time compare; 10-minute lifetime; single use; 5 attempts, 3 resends 60 s apart and 5 challenges per user per hour, all counted under a lock (DD-2F08). The e-mail goes only to the account's own address, never to one from the request. The hint is masked (`e•••@klub.pl`).
- **No bypass:**
  - No configuration turns the requirement off, and no test-mode code exists (DD-2F09).
  - The platform's full cookies and `refreshToken` of a challenged sign-in never leave the wrapper, and `session_token` is cleared.
  - Refresh with a provisional token is refused by the platform.
  - Social sign-in admits a required user only through Google (DD-2F06).
  - Gaining the requirement ends old sessions (DD-2F10).
  - API keys: no Vereino role holds `api_keys.*` (a catalogue unit test).
  - `OM_AUTOLOGIN_*` is forbidden in production, and the deploy check covers it.
- **Enumeration:** the gate runs only after a correct password, so `second_factor_use_google` reveals nothing to someone without the password.
- **Failure modes (S3.6):** every failure ends with no session, the platform session deleted and no full cookies.
  - Cache or lock down → 503.
  - The e-mail send fails or exceeds 10 s → 503, marker and session deleted.
  - An unexpected exception in the gate → 500.
  - Wrong code → counted. Two parallel `verify` calls are serialized by the lock; the second finds no marker (401).
  - A platform upgrade that changes the gate → TEST-2F01 fails in CI before the upgrade merges.
- **Known limit:** Vereino cannot see whether the Google account has 2-Step Verification on (Google's ID token carries no reliable `amr`). The owner's decision accepts the Google account as the factor (Q-2F04). ASVS V6.8.4 stays partial, and the profile line asks staff to turn 2-Step Verification on.
- **Compliance:**
  - V6.3.3 is met once phase 1 ships (password sign-ins challenged; Google already the factor).
  - V6.4.4 is met by the reset with a verification note (phase 1).
  - V6.5.1–V6.5.5 and V6.6.2–V6.6.3 apply to the e-mail code.
  - The rows in `docs/compliance/` change state in the PR that ships each phase.

## Integration Coverage

Tests live in `packages/app/.ai/qa/tests/foundation/second-factor/`. They are self-contained (own tenant, organization and users; cleanup in `finally`). They read codes from the `OM_TEST_MODE` e-mail capture and use the social sign-in spec's OAuth fake for Google.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-2F01-staff-email-code | integration + security | a club with an administrator, a treasurer, a coordinator and a coach; a coach later made treasurer | (1) Password sign-in of each. (2) With the provisional token: call a staff API, `/backend` and `GET /api/auth/session/refresh`. (3) Wrong code ×4, then the right one. (4) Reuse the code. (5) A fresh challenge with 5 wrong codes. (6) Two resends within 60 s. (7) Six password sign-ins in an hour. (8) Assign the coach the treasurer role while signed in. | (1) The administrator and treasurer get `secondFactor`, a provisional token and no `session_token`; the coordinator and coach sign in directly. (2) Staff API 401, `/backend` → `/login`, refresh refused. (3) `attemptsLeft` counts down; the right code issues a session that reaches `/backend`. (4) The reused code gets 401. (5) The 5th wrong code ends the challenge and its session. (6) The second resend gets 429. (7) The 6th sign-in gets 429 `second_factor_challenges_limited`. (8) The coach's old session gets 401. | REQ-2F01, REQ-2F03, REQ-2F05 |
| TEST-2F02-second-factor-page | UI | an administrator | browser: `/login` → `/login/second-factor`, code from the capture; en and pl; 375 px; axe; keyboard only | the page renders the masked address; the wrong-code line is announced; Enter submits; the resend countdown shows; success lands on `/backend`; no console errors | REQ-2F01 |
| TEST-2F03-google-and-reset | integration + security | administrator A; a treasurer T with a Google link (fake) and a Facebook link; a second club B | (1) T signs in with Google. (2) T signs in with Facebook. (3) A resets T. (4) T's old session is used. (5) T signs in with the password. (6) A resets A. (7) A resets a club B user. (8) The operator CLI resets A. (9) Phase 2: T, linked to Google again, signs in with the password. | (1) The Google session reaches `/backend`. (2) Facebook is refused (`use_google`), with no session. (3) The reset removes T's links. (4) The old session gets 401. (5) The password then needs the e-mail code. (6) Self-reset gets 403. (7) Club B gets 404. (8) The CLI reset ends A's sessions. (9) 403 `second_factor_use_google` and no session. | REQ-2F02, REQ-2F04 |
| TEST-2F04-reset-dialog | UI | administrator, a treasurer, a coach | browser: person record → "Sign-in methods" → "Reset second factor" | the action is hidden on the administrator's own record and for the coach; the dialog requires the note and the checkbox; success flash; en and pl, 375 px, axe | REQ-2F04 |

The existing suite exercises every path that signs a required user in. Phase 1 makes `_fixtures/auth.ts` export a `getAuthToken` with the platform helper's signature that completes the challenge. It also changes `signInBrowser` (`_fixtures/club-structure.ts`) and every direct `POST /api/auth/login` in the suite to do the same. The 60 s resend spacing, the 3-resend cap and the hourly cap's window are unit-tested in `lib/second-factor.ts` with an injected clock; integration tests do not wait.

## Implementation Phases

Validation for every phase: `yarn verify` (the single gate) and `yarn test:integration:vereino --filter <TEST-ID>` for each test of the phase. Pure logic in `src/modules/foundation/lib/second-factor.ts` keeps 100 % unit coverage. No migration, no new dependency.

### Phase 1 — E-mail code, Google-only social sign-in, reset

- **Depends on:** the owner's approval of this spec (status `Ready for implementation`, or `phase-ready` on the phase 1 story with Q-2F02 and Q-2F03 answered).
- **Outcome:** J-2F01, J-2F03 and J-2F04. No password-only and no non-Google session for a required user; the support path for a lost factor exists.
- **Why this order / value delivered:** it closes the ASVS V6.3.3 gap and gives the recovery that a mandatory mailbox needs. Making Google mandatory for those who have it is a refinement.
- **Deliverables:**
  - Features: `foundation.second_factor.required` and `foundation.second_factor.reset` in `acl.ts` and `catalogueRoleFeatures()`, with unit tests (including "no Vereino role holds `api_keys.*`").
  - Logic: `lib/second-factor.ts` with its tests.
  - Slice: the MFA-pending route registration (V-2F02 first); `second-factor/{gate,challenge,lock}.ts`; the link-free session issuer extracted from `services/identity.ts`; the gate in `src/app/api/auth/login/route.ts` (provisional answers not clearing the account counter); the `verify` and `resend` routes; the Google-only branch of the identity callback; the session end in `syncAuthRoles`.
  - Recovery: the reset command, its route, the CLI `reset` and `end-sessions`, and the "Reset second factor" dialog.
  - The `/login/second-factor` page and the `/login` sentences.
  - Error codes, events, i18n en + pl, the e-mail template.
  - The fixture wrapper and the suite-wide switch to it.
  - Isolation inventory rows; ASVS rows; `docs/ops/deploy.md` rollout steps and the autologin check.
- **Steps:**
  1. Features, catalogue, pure logic with tests. V-2F02: registration and the page route checked with a minimal registered route.
  2. Session issuer refactor; Google sign-in unchanged (TEST-S01 still green).
  3. Gate in the wrapper, challenge, lock, e-mail (TEST-2F01, sign-in half).
  4. `verify`, `resend`, session end on the role grant, Google-only callback branch (TEST-2F01, TEST-2F03 items 1–2).
  5. Fixture wrapper; switch `getAuthToken`, `signInBrowser` and direct logins; run the affected tests.
  6. Page and sentences (TEST-2F02).
  7. Reset command, route, CLI, dialog (TEST-2F03 items 3–8, TEST-2F04).
  8. `end-sessions`, `deploy.md`, ASVS rows.
- **Independent slices / estimated commits:** about 8 commits in the step order. Step 5 needs step 4. Step 6 is independent of step 7.
- **Requirements closed:** REQ-2F01, REQ-2F03, REQ-2F04, REQ-2F05
- **Tests:** TEST-2F01, TEST-2F02, TEST-2F03 (items 1–8), TEST-2F04, and the existing suite through the fixtures.
- **Exit gate:** on staging, an administrator and a treasurer sign in with password and e-mail code, and a coach signs in without one. A provisional token reaches no staff API. A reset works from the dialog and from the CLI. `/login/second-factor` is checked in light and dark at 375 px in en and pl.

### Phase 2 — Google required when connected

- **Depends on:** the phase 1 exit gate; Q-2F01 answered.
- **Outcome:** J-2F02.
- **Why this order / value delivered:** Google becomes the only way in for everyone who has it, which removes the e-mail code as an attack path for them.
- **Deliverables:**
  - the Google branch of the gate;
  - `secondFactorRequired` in `GET /api/foundation/identity/me` and the profile line;
  - routing the person record's "Unlink Google" of a required user through the reset;
  - i18n; the ASVS V6.8.4 note.
- **Steps:**
  1. Gate branch (TEST-2F03 item 9).
  2. Profile line and unlink routing.
- **Independent slices / estimated commits:** 2 commits.
- **Requirements closed:** REQ-2F02
- **Tests:** TEST-2F03 (item 9)
- **Exit gate:** on staging, a Google-linked treasurer is refused with the password and admitted with Google.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-2F01 | J-2F01, `/login/second-factor` | wrapper gate, `verify`, `resend`, `foundation.second_factor.challenged|verified|locked`, `end-sessions` | 1 | TEST-2F01, TEST-2F02 | AC-2F01 |
| REQ-2F02 | J-2F02, `/login`, profile | Google-only callback branch (phase 1), gate Google branch, `second_factor_use_google` (phase 2) | 1, 2 | TEST-2F03 | AC-2F02 |
| REQ-2F03 | J-2F04 | `foundation.second_factor.required`, `catalogueRoleFeatures()`, session end in `syncAuthRoles` | 1 | TEST-2F01 | AC-2F03 |
| REQ-2F04 | J-2F03, person record | `foundation.second_factor.reset` command, route, CLI, event | 1 | TEST-2F03, TEST-2F04 | AC-2F04 |
| REQ-2F05 | every challenge | marker and lock rules, `second_factor_unavailable`, `challenges_limited`, `code_invalid`, `challenge_expired`, `resend_limited` | 1 | TEST-2F01 | AC-2F05 |

## Rollout, Migration, and Rollback

- **Migration:** none.
- **Role features:** after deploying phase 1, run `yarn mercato auth sync-role-acls` so that existing clubs' `vereino_club_admin` and `vereino_treasurer` roles get the new features. Until then the requirement does not apply to existing clubs, so the runbook runs it in the same release step.
- **Existing sessions:** sessions issued before the release were never challenged. The runbook runs `yarn mercato foundation second-factor end-sessions` for each club right after the ACL sync (Q-2F05).
- **Prerequisites:**
  - a working transactional e-mail provider in production (the code is the fallback's only channel);
  - `CACHE_STRATEGY=redis` when replicas > 1 (already required by DD-S04);
  - `OM_AUTOLOGIN_*` unset (deploy check).
- **Observability:** fingerprints `foundation.second_factor.unavailable` (cache, lock or e-mail), `foundation.second_factor.locked` and `foundation.second_factor.provider_refused`; the events above.
- **Rollback:** reverting the PR restores the wrapper to the account limit only, and password sign-in issues full sessions again. The features left on roles are inert. Rollback needs no migration.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| The e-mail provider is down | staff without Google cannot sign in | 503 with retry; Google sign-in still works; the fingerprint alerts | accepted: fail closed (DD-2F09) |
| E-mail is a weak second channel (same mailbox as password reset) | a phished mailbox defeats both | Google required when connected (DD-2F06, phase 2); the owner's decision | accepted by the owner (option 1) |
| The Google account itself has no 2-Step Verification | Google sign-in is one factor in practice | the profile line asks staff to turn it on (Q-2F04) | accepted by the owner |
| The platform super-admin is exempt (Q-2F02) | the account with the widest reach has one factor | Railway and operator controls (#735); the open question records it as an explicit risk acceptance | ⚠ the owner's call |
| The platform's MFA-pending gate or the login handler changes in an upgrade | the challenge silently stops | TEST-2F01 fails in CI; the wrapper is a recorded local patch (#738) | low |
| A role later gains `api_keys.*` | a required user creates a key that skips sign-in | catalogue unit test (phase 1) | low |
| Suite-wide fixture change | many integration tests touched in one PR | one wrapper with the platform signature; mechanical import switch; the affected tests run before the PR | review effort |
| Last administrator loses Google and e-mail | club locked out of administration | operator CLI reset (DD-2F07) | operator effort |

## Acceptance Criteria

- [ ] **AC-2F01** — A club administrator or treasurer who signs in with a password reaches no staff API, back-office page or session refresh until they enter the e-mailed code. The right code issues a session that reaches `/backend`. A used, expired or sixth code does not.
- [ ] **AC-2F02** — A required user signs in with Google. A non-Google provider is refused. In phase 2, a required user with a Google link is refused password sign-in with the Google pointer and no session.
- [ ] **AC-2F03** — Coordinators, coaches, guardians, members and payers sign in exactly as before. A user who gains the requirement is signed out.
- [ ] **AC-2F04** — An administrator resets another club member's second factor with a note: the links are removed, their sessions end, and the reset is in the command log. Resetting oneself and a person of another club are refused. The operator resets from the shell.
- [ ] **AC-2F05** — With the cache, the lock or the e-mail send down, no session is issued (503). Codes are single use, hashed and expire in 10 minutes. They allow 5 attempts and 3 resends per challenge, and 5 challenges per user per hour, counted under a lock.
- [ ] Every listed surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (no role-name guards, fail closed, isolation inventory, Ask First), `.ai/guides/spec-delivery.md`, the engineering standards (S8.2, ADR-023, ENG-Q-09), the social sign-in spec, `BACKWARD_COMPATIBILITY.md`, skill `om-spec-writing`, lessons `future-module-gates-and-auth-login-interceptors` and `core-auth-ships-an-mfa-pending-gate` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | REQ-2F01…05 each with a phase, a test and an AC |
| Every workflow completes end to end without a catch-all integration phase | pass | J-2F01, J-2F03, J-2F04 in phase 1; J-2F02 in phase 2 |
| Platform-native reuse and extension points were chosen before custom code | pass | the platform's `mfa_pending` gate, the existing login wrapper, a session issuer shared with Google sign-in, the cache marker, advisory locks, the e-mail sender; no table, no dependency |
| UI contracts identify references, canonical components, and theme/state coverage | pass | four surfaces with references, components and states |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | phases 1–2 |
| Contracts of installed modules confirmed at the field and behavior level | pass | V-2F01 confirmed by code read; V-2F02 is the first step of phase 1 |
| Architectural review | pass | fresh-context review of 2026-11-26: C1, H1–H4, M1–M6 and the low findings applied (run log) |
| User approval for implementation | **fail** | waiting for the owner: the open questions below and approval of the spec |

Verdict: `Blocked — owner approval of the spec and answers to Q-2F01…Q-2F03`

## Open Questions

Blocking questions must be resolved before setting `Status: Ready for implementation`. *Blocking?* names the phases a question blocks: `no`, `phase N` or `phases N, M` (a question that blocks the whole spec lists every phase). A story of a Draft spec may start once the decision session labels it `phase-ready`, after every question naming its phase is answered (`SDLC.md` → Definition of Ready). `yarn spec-questions:check` rejects other values in specs dated from 2026-11-27.

Already decided by the owner on 2026-11-26 (#736): option 1 (Google, fallback password + e-mail code); administrator and treasurer only; recovery by an administrator, or by the operator for the last administrator.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-2F01 | A required user who has connected Google: refuse password sign-in entirely (DD-2F06), or allow password + e-mail code as a second path? | Władek Kuć | phase 2 | pending — default: refuse; the password path would make the weaker e-mail code the attack path |
| Q-2F02 | The platform super-admin (the operator's account): exempt in 1.0, or also challenged? | Władek Kuć | phase 1 | pending — ⚠ default: exempt, as an explicit risk acceptance. It is the account with the widest reach (D-034), and #735 (Railway lock-down) is not yet delivered. Challenging it is a small change (the same gate; fixtures that use `club.superToken` complete the code too) |
| Q-2F03 | Codes: 6 digits, 10 minutes; 5 attempts and 3 resends 60 s apart per challenge; 5 challenges per user per hour (DD-2F05) — accept? | Władek Kuć | phase 1 | pending — default: accept |
| Q-2F04 | Google sign-in counts as the second factor although Vereino cannot check that the Google account has 2-Step Verification on (ASVS V6.8.4 stays partial). Accept, with the profile line asking staff to turn it on? | Władek Kuć | no | pending — default: accept (follows from the owner's option 1) |
| Q-2F05 | End every required user's sessions at rollout (`end-sessions`), or let pre-release sessions run out (up to `REMEMBER_ME_DAYS`)? | Władek Kuć | no | pending — default: end them |

Contract verifications:

| ID | What to check | Phase | Result |
|---|---|---|---|
| V-2F01 | A `mfa_pending` token is refused on pages, on unregistered API routes and by the refresh route, and accepted with a live `sid` on registered routes; the login after-interceptor cannot set a status (so the gate lives in the wrapper) | 1 | **Confirmed by code read 2026-11-26:** `@om/shared/lib/auth/server.ts:375-428`, `@om/shared/lib/auth/jwt.ts:391-405`, `@om/shared/lib/auth/mfaPendingAccess.ts`, `@om/core/modules/auth/api/session/refresh.ts:28-86`, `@om/core/modules/auth/lib/sessionIntegrity.ts:56-66`, `@om/shared/lib/crud/{api-interceptor.ts:42-45,interceptor-runner.ts:215-277}`, `@om/core/modules/auth/api/login.ts:201-258`; Vereino wrapper `src/app/api/auth/login/route.ts` |
| V-2F02 | `registerMfaPendingAccessRoutes` keeps its registry in a module-scope `Map`, so the call must run in the process and bundle that serves the `[...slug]` API dispatcher (the commercial module did it from its bootstrap). Also check whether an app frontend page may live at `/login/second-factor` beside the platform's `/login` | 1 | first step of phase 1, with a test that fails when the registration is missing (TEST-2F01 `verify` call) |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-26-vereino-staff-second-factor/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row); `cat .ai/specs/changelog/2026-11-26-vereino-staff-second-factor/*.md` lists them in date order.
