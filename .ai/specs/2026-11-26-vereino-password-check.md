# App-owned password check: one policy for forms and API, common and breached passwords (ASVS V6.2)

**Date**: 2026-11-26
**Status**: In progress — approved by the owner on #779 (2026-11-26: built-in list, write the spec and build it)

> Related: #779 (this spec), #747 / PR #781 (production `OM_PASSWORD_*` policy, `docs/ops/deploy.md` → *Password policy*), #743 (V6.2.9 long passwords), epic #734; `docs/compliance/asvs-requirements.md` rows V6.1.2, V6.2.4, V6.2.5, V6.2.8, V6.2.11, V6.2.12; engineering standards S3.1 (platform source stays untouched), S6.7 (error codes). Platform code read: `@open-mercato/shared/lib/auth/passwordPolicy.ts`, `@open-mercato/core/modules/auth/api/{profile/route.ts,users/route.ts,reset/confirm.ts}`, `commands/users.ts`, the client pages `backend/profile/change-password`, `backend/auth/profile`, `frontend/reset/[token]`, `backend/users/create`, `backend/users/[id]/edit`. Identifiers: decisions `PW-D01…`, requirements `REQ-PW01…`, tests `TEST-PW01…`, acceptance `PW-AC-01…`.

## 📝 TLDR

Production sets the platform's password variables (`OM_PASSWORD_*`: at least 12 characters, no character classes, #747), but the platform's browser forms never see them and keep demanding a digit, an upper-case letter and a special character; nothing rejects common, breached or club-specific passwords; and a password longer than 72 bytes is silently cut by bcrypt. This spec adds one Vereino password check in the `foundation` module: the platform policy read on the server and handed to the browser forms, a built-in list of the ~100k most common (breached) passwords, banned context words, a 64-character / 72-byte maximum and exact matching. It runs on every API path that sets a password, through a command interceptor and two route wrappers; platform `auth` source stays untouched.

## 📝 Problem Statement

- **V6.2.5** — the change-password, profile, reset and user create/edit pages are client components that call `getPasswordPolicy()` in the browser. It reads `process.env[key]` by a computed key, which Next.js does not inline, so the browser falls back to the platform default (6 characters, digit, upper case, special) whatever the server says. A 12-character lower-case passphrase the server accepts is refused by the form.
- **V6.2.4, V6.2.12** — no common or breached password is refused; `password12345` passes the production policy.
- **V6.1.2, V6.2.11** — no documented list of context words; `Vereino2026!!` or the club's own name with a year passes.
- **V6.2.8** — bcryptjs ignores bytes beyond 72, so two different long passwords sharing their first 72 bytes are the same password; `PUT /api/auth/profile` trims `currentPassword` before checking it while sign-in does not, so `secret  ` is accepted as the current password `secret`.

## Non-goals

- Editing platform `auth` source or ejecting its pages (S3.1). Gaps that only the platform can close are reported upstream (see *Residual gaps*).
- A breached-password web service: the owner chose a built-in list (#779, 2026-11-26); nothing is sent out.
- Strength meters, password expiry, composition rules (ASVS forbids the last two).
- `mercato auth set-password` and tenant provisioning (operator shell commands that write `passwordHash` directly; the first-deploy accounts are #747).

## Resolved assumptions (autonomous defaults)

| # | Question | Answer | Rationale |
|---|---|---|---|
| Q1 | Which list and where from? | NCSC "100k most used passwords" (derived from Have I Been Pwned), as published in SecLists (MIT), lower-cased and de-duplicated: 97 746 entries, shipped as a bundled module. | Owner decision: ~100k, built in, nothing sent out; it is a breached-password list as well as a common one. |
| Q2 | Who owns the minimum length and class rules? | The platform variables `OM_PASSWORD_*` stay the single source; Vereino reads them on the server with the platform's own `getPasswordPolicy()` and adds its rules on top. | The platform's server validators read the same variables; a second source would let form and server disagree. |
| Q3 | How do the forms get the policy? | The root layout reads it on the server and a client bridge writes it into the browser's `process.env` before any page renders, so the platform's `getPasswordPolicy()` in the browser returns the server policy. | No page copy or eject; one small seam, covered by a browser test that fails if a Next.js change breaks it. |
| Q4 | How strict are context words? | A password is refused when, after removing every context word from it (case- and accent-insensitive, letters and digits only), fewer than 8 letters or digits remain. | Refuses `Vereino2026!` and `KlubOrzel1923`, accepts a long passphrase that happens to contain a word. |
| Q5 | Context words for the reset link, where no session scope exists? | Product words only. Club and user words apply where the scope is trusted (signed-in change, admin create and edit). | A token-hash lookup before the platform handler would be a new system-scope read (AGENTS.md exception list, Ask First); deferred. |
| Q6 | Leading or trailing whitespace? | Refused in a new password. | The platform's change-password form trims what it sends; a password that cannot survive that trim would lock its owner out. |

## 📝 Proposed Solution

1. **Policy** — `foundation/lib/password-check.ts` (pure): `checkPassword(password, { policy, contextWords })` returns `{ ok: true }` or the first failing rule:
   | Rule | Code | Status |
   |---|---|---|
   | Shorter than `policy.minLength` or a class rule set in `OM_PASSWORD_*` | `password_policy` | 422 |
   | Longer than 64 characters or 72 UTF-8 bytes | `password_too_long` | 422 |
   | Leading or trailing whitespace | `password_whitespace` | 422 |
   | On the common/breached list (lower-cased exact match) | `password_too_common` | 422 |
   | Built from context words (Q4) | `password_context_word` | 422 |
   Product words: `vereino`, `openmercato`, `mercato`. Club words: the organization's name and slug. User words: the e-mail's local part and domain label, and the user's name.
2. **List** — `foundation/lib/common-passwords.ts` exports the list as one string; `services/password-check.ts` loads it with a dynamic `import()` on first use and keeps a `Set` (about 5 MB of memory per server process).
3. **Server enforcement** (every API path that sets a password):
   - command interceptor `foundation.password-check` on `auth.users.create` and `auth.users.update` (covers `POST`/`PUT /api/auth/users` and `PUT /api/auth/profile`): when the input has `password`, check it with product, club (the command's organization) and user words; block with status 422 and `{ error, code, issues: [{ path: ['password'], message }] }`;
   - `src/app/api/auth/reset/confirm/route.ts`, a Next route in front of the platform handler (the pattern of `api/auth/login` and `api/auth/reset`): reads the form, checks the password with product words, answers `{ ok: false, error, code }` 422 or passes the request on;
   - `src/app/api/auth/profile/route.ts` in front of `PUT`: a `currentPassword` with leading or trailing whitespace is answered as an incorrect current password (400, the platform's body), so the trimmed value is never checked in its place (V6.2.8). `GET` passes through.
4. **Forms** — the root layout reads `getPasswordPolicy()` on the server and renders `PasswordPolicyBridge` (client), which writes `OM_PASSWORD_MIN_LENGTH` and the three class flags into the browser's `process.env` during its first render, before the pages below it. The platform forms then show and check the same policy as the server. Length, list and context-word refusals come back from the server and show in each form's existing error area, localized (`foundation.errors.password_*`, en + pl).
5. **Test environment** — the integration runner sets the production values (`OM_PASSWORD_MIN_LENGTH=12`, classes `false`), so tests run against the policy production uses.

### Design Decisions and Alternatives

| Decision | Why | Alternatives | Why not |
|---|---|---|---|
| **PW-D01** Built-in NCSC/HIBP top-100k list, bundled as a module and loaded lazily (owner, #779). | No outbound call, no new dependency, works offline; the list is breached passwords by origin. | k-anonymity range API; a dependency (`zxcvbn`) | Owner chose the offline list; a range API needs a network path and a failure policy. |
| **PW-D02** Enforce in a command interceptor plus route wrappers, not in each page. | One check for every client (forms, API tokens, tests); UMES seam, no platform edit. | Override the five pages | Copies about 1 500 lines of platform UI that drift on every upgrade. |
| **PW-D03** Hand the policy to the forms by writing the browser's `process.env` from a server-rendered bridge. | The platform pages already call `getPasswordPolicy()`; giving it the right values fixes all five without copying them. | `next.config.ts` `env` (inlines only literal `process.env.X`, not a computed key); a bundler alias of the platform module | The first does not work for computed keys; the second patches platform code through the build. |
| **PW-D04** Byte cap 72 alongside 64 characters. | bcrypt reads 72 bytes; above it two passwords collide. 64 ASCII characters fit; 64 Polish letters (2 bytes each) do not, which is the stated trade-off. | Pre-hash before bcrypt | Changes the platform's hash format (platform source). |

## 📝 Delta

### Capability: password-check

#### ADDED — REQ-PW01 Every API path that sets a password applies the Vereino check
- **Scenario** — WHEN `POST /api/auth/reset/confirm`, `PUT /api/auth/profile`, `POST` or `PUT /api/auth/users` carries a password on the common list THEN 422 `password_too_common`, nothing is stored, and the old password still signs in.
- **Scenario** — WHEN the password is 65 characters, or 37 `ż` (74 bytes) THEN 422 `password_too_long`.
- **Scenario** — WHEN the password has a leading or trailing space THEN 422 `password_whitespace`.
- **Scenario** — WHEN the password is `Vereino2026!!` THEN 422 `password_context_word`; WHEN an administrator sets a password built from the club's name THEN 422 `password_context_word`.
- **Scenario** — WHEN the password is a 20-character passphrase not on the list THEN the platform handler runs as before.

#### ADDED — REQ-PW02 The forms show and check the server policy
- **Scenario** — WHEN the server policy is 12 characters without classes THEN the reset and change-password pages state "at least 12 characters" with no class requirement and accept a lower-case 20-character passphrase.
- **Scenario** — WHEN the server refuses a password THEN the form shows the localized reason.

#### ADDED — REQ-PW03 The current password is checked exactly as typed
- **Scenario** — WHEN `PUT /api/auth/profile` carries the right current password followed by a space THEN 400 with the platform's "Current password is incorrect" body and the password is unchanged.

## 📝 Architecture

- `foundation/lib/password-check.ts` — rules, normalization, context-word removal (unit tests, 100 %).
- `foundation/lib/common-passwords.ts` — the list (generated once; header names the source and licence).
- `foundation/services/password-check.ts` — `passwordCheck(container)`: lazy list, product/club/user words, localized refusal.
- `foundation/commands/interceptors.ts` — `foundation.password-check` (no `features`: applies to every caller).
- `foundation/lib/error-codes.ts` + `i18n/{en,pl}.json` — five `password_*` codes.
- `src/app/api/auth/reset/confirm/route.ts`, `src/app/api/auth/profile/route.ts` — wrappers re-exporting the platform `metadata`/`openApi`.
- `src/components/PasswordPolicyBridge.tsx` + `src/app/layout.tsx` — the bridge.
- `packages/app/scripts/vereino-ephemeral.mjs` — production policy values in the test environment.
- `docs/ops/deploy.md`, `docs/compliance/asvs-requirements.md` — updated rows.

Contracts: no route, schema, event or ID is added or removed. The three routes gain 422 answers with new codes (additive; `BACKWARD_COMPATIBILITY.md` — new error codes on an existing route are additive). No migration, no dependency.

## 📝 Edge Cases & Failure Scenarios

- **List module fails to load** → the check fails closed (500 from the interceptor, the request is refused), logged; a deploy smoke sign-in still works because sign-in does not check.
- **Existing passwords that break the new rules** → keep working (only new passwords are checked); a password longer than 72 bytes still signs in on its first 72 bytes (residual, below).
- **`process.env` bridge stops working after a Next.js upgrade** → forms fall back to the platform default; TEST-PW02 fails and blocks the upgrade.
- **An organization without a name** → club words are empty; product and user words still apply.

## Residual gaps (reported upstream, not built here)

- The platform's change-password form trims the new password before sending it (`backend/profile/change-password/page.tsx`); under Q6 every password that passes Vereino's check is trim-stable, so the trim changes nothing for new passwords.
- Club and user words are not applied on the reset link (Q5).
- A caller of another tenant (the super administrator setting a club user's password) gets the product words and the words it sends (address, name), not the club's: records are read only inside the caller's tenant.
- Passwords set before this change and longer than 72 bytes are still compared on their first 72 bytes.

## 📋 Phasing

One phase: the check, its enforcement points, the bridge and the docs ship together (each alone leaves a form and server that disagree).

## 📋 Implementation Plan

### Phase 1 — Vereino password check
- Step 1.1 — `lib/password-check.ts`, `lib/common-passwords.ts`, error codes, i18n; unit tests (rules, normalization, context words, byte cap).
- Step 1.2 — `services/password-check.ts` and the command interceptor; reset-confirm and profile wrappers.
- Step 1.3 — `PasswordPolicyBridge` in the root layout; production policy in `vereino-ephemeral.mjs` (+ its unit test).
- Step 1.4 — TEST-PW01 (API: reset link, admin set, profile change — each refusal code, the accepted passphrase, the trimmed current password); TEST-PW02 (browser: reset page and change-password page state 12 characters without classes, accept a lower-case passphrase, show the common-password refusal). *(PW-AC-01, PW-AC-02)*
- Step 1.5 — `docs/ops/deploy.md` *Password policy* and ASVS rows V6.1.2, V6.2.4, V6.2.5, V6.2.8, V6.2.11, V6.2.12. *(PW-AC-03)*

## Acceptance

- **PW-AC-01** — TEST-PW01 passes: every API path refuses a common, too long, whitespace-bounded and context-word password with its code, and accepts a good passphrase; a trimmed current password is refused.
- **PW-AC-02** — TEST-PW02 passes in a production build: the forms state the server's policy and accept a lower-case passphrase.
- **PW-AC-03** — the six ASVS rows name the check and its tests.

## Rollback

Revert the PR: the interceptor, wrappers and bridge go away together and the platform behaviour of #781 returns. No data changes.

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-26-vereino-password-check/`.
