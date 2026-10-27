# Vereino social sign-in — Google and Facebook for account holders

**Date**: 2026-10-27
**Status**: Draft (design complete; waiting for the product owner's approval on the PR, the `arctic` dependency approval and V-S04)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: the product owner's request of 2026-10-27 (brief decision D27, `research/decisions/D-027-social-sign-in.md`); the club management spec (`2026-10-20-vereino-club-management.md`: REQ-040, DD-35 as extended by D27, R01, R10, D-022; V-2); the foundation spec (`2026-10-27-vereino-foundation-primitives.md`: P-01 `ScopedEntityBase`, P-02 `authorizeScoped` + `assertInScope`, P-03 the `self_user` grant, P-09 `encryptedField`, P-17 `errors(table)`, DD-F01, DD-F03, DD-F14); the installed `@open-mercato/*` 0.9.0 packages (`core/modules/auth/{api/autologin.ts,api/login.ts,frontend/login-injection.ts,lib/tokenHash.ts}`, `core/modules/communication_channels/lib/oauth-state.ts`, `enterprise/src/modules/sso/**` read for comparison only); the open-source research of 2026-10-27 (Auth.js verification tokens, Django's uniform responses, Supabase magic-link limits); the lesson `enterprise-package-is-commercial`. This spec was split out of the foundation spec on 2026-10-27 (its Q14) because sign-in is a feature with its own table, routes, permissions, configuration and external reviews, not a reusable mechanic. Paths `src/...` are relative to `packages/app/`; `@om/*` means `packages/app/node_modules/@open-mercato/*/src`.

## TLDR

A person who already holds an invited Vereino account connects Google (phase 1) or Facebook (phase 2) from `/club/profile` and from then on signs in with one click on `/login`. No social sign-in ever creates an account, matches an e-mail or widens an account: the invitation (V-2) stays the only way an account comes into being (R01), the age threshold stays with the administrator (R10, D-022), and a sign-in without a link, a replayed state or a provider failure all show one generic message. The platform offers no OAuth outside the commercial enterprise module, so the feature is a Vereino module slice: one table `vereino_identity_links` in the `foundation` module, an OAuth/OIDC client built on `arctic`, a single-use state marker in the platform cache, and session issuance through the installed `AuthService.createSession` + `signJwt` seam. The only tenant-blind read is the lookup on (`provider`, `subject`), which the owner added to the DD-35 list (D27).

## Problem Statement

Guardians and staff keep forgetting a password they use a few times a season; the product brief records that guardians mute everything and dig through channel history, and that the club's board asked for sign-in with the accounts people already have (D27). Core `auth` offers e-mail + password, invitation and reset only; the only SSO implementation is the commercial `sso` module (OIDC/SAML, SCIM, JIT), which the licensing lesson forbids and which has no Facebook flow. Without a design, the first implementer would either enable the enterprise module or hand-write an OAuth client — both unacceptable.

## Overview and Success Measures

- **Primary outcome:** at the phase 2 pilot, at least half of the guardians with an account have connected a provider and sign in without a password reset (measured from `last_signed_in_at` on `vereino_identity_links` against `auth` password-reset events).
- **Leading indicators:** zero accounts created by the sign-in routes (TEST-S01); zero `identity=failed` fingerprints in a week of staging use; the Google consent screen verified before the pilot.
- **Baseline:** no social sign-in; every guardian signs in with the invitation password.
- **Market / product reference:** Auth.js (hashed single-use verification tokens, return-and-delete), Django (one uniform response for link requests, constant-time compare), Supabase (one-time links, short lifetime, resend limit) — adopted; enterprise `sso` (allowed domains, SCIM, JIT) — rejected for audience and licence; stateless HMAC tokens — rejected in favour of a stored link with an audit trail.

## Goals

- **REQ-S01** (Should; D27) — A person with a linked Google identity signs in on `/login` with one click and lands on `/club` with the platform's own session.
- **REQ-S02** (Should; D27) — A signed-in person connects and disconnects Google and Facebook in `/club/profile`; the administrator sees and unlinks any person's identities; the last sign-in method cannot be removed.
- **REQ-S03** (Should; D27) — Facebook works like Google, including the no-e-mail case and the data-deletion callback Facebook requires.
- **REQ-S04** (Must) — A sign-in without a link, a replayed or tampered state, an unavailable state store or a provider failure never creates an account, never reveals whether an identity or an e-mail exists, and never issues a session.

## Non-goals

- Self-registration, JIT provisioning, account creation or e-mail matching from a social sign-in (R01, DD-S02).
- Enterprise `sso`, SAML, SCIM, MFA (lesson `enterprise-package-is-commercial`).
- Other providers (Apple, Microsoft) — the provider registry allows them later without a new table.
- Replacing the password: the invitation and reset flows stay unchanged.

## Proposed Solution

One slice inside the `foundation` module (DD-F01): the entity `IdentityLink` on `ScopedEntityBase` (P-01) with `email_at_link` through `encryptedField` (P-09); a provider registry `identityProviders` (`google`, `facebook`) over `arctic`; two sessionless routes (`start`, `callback`) with PKCE and a single-use state marker (the `oauth-state.ts` pattern of `communication_channels`); three authenticated routes (`me`, `link`, `unlink`) whose commands are platform `CommandHandler`s calling `authorizeScoped` with the `self_user` grant (P-02, P-03) and one admin list; a widget on the installed `auth.login:form` injection spot; a "Connected accounts" section on `/club/profile` built from the member layer; a persistent subscriber on `auth.user.deleted` in the platform's own `metadata` shape. Session issuance copies `core/modules/auth/api/autologin.ts` (`AuthService.createSession` + `signJwt`, cookies on the redirect response), so logout, refresh and session integrity stay the platform's. It is the smallest platform-native solution because every piece except the table and the OAuth client is an installed seam.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-S01** Own slice on `arctic` inside `foundation`; session through `AuthService.createSession` + `signJwt` (V-S01) | core `auth` has no OAuth; `arctic` is small, MIT, provider-agnostic, PKCE for Google (OIDC) and Facebook (OAuth 2.0) | enterprise `sso`; an external IdP (Keycloak, Auth0, Supabase); a hand-written client | licence and audience mismatch, no Facebook flow; a second user store against R01; a security surface this team should not own |
| **DD-S02** Linking only from a signed-in session (`/club/profile`) or by the administrator; a sign-in succeeds only for an already linked identity; no JIT, no e-mail matching | R01; no e-mail enumeration; an e-mail match at sign-in would need a tenant-blind read of `auth:user` outside DD-35 | link by verified e-mail at first sign-in; create the account on first sign-in | the first needs a second system-scope read and a wrong-person risk for one convenience click; the second bypasses the administrator, the age threshold and the person record |
| **DD-S03** The sign-in lookup on `vereino_identity_links` (`provider`, `subject`) is the one system-scope read of this feature, added to the DD-35 list by D27; it narrows at once to the linked user's tenant and organization | before a session exists nothing but the provider identity is known | resolve the organization from the request host or a club slug | 1.0 runs one tenant and one organization per instance (DD-02), but the code must not rely on it; a slug in the login URL leaks the club and still needs a lookup |
| **DD-S04** OAuth state = random 32-byte value stored as a 10-minute single-use marker in the platform cache plus a `HttpOnly`, `SameSite=Lax`, `Secure` cookie; the store being unreachable fails closed. PKCE S256 plus this server-side single-use state is the whole anti-replay design: no OIDC nonce and no per-subject rate limit on the callback (both would duplicate what the marker already guarantees — review of 2026-10-27) | same pattern as the installed `communication_channels` (`lib/oauth-state.ts`); replay protection shared across replicas with `CACHE_STRATEGY=redis` | a `foundation_oauth_states` table; cookie-only state; PKCE + state + nonce + per-subject limit | a table for a 10-minute value; cookie-only state has no replay protection; the extra layers add surface without a threat they close |
| **DD-S05** Google first (phase 1), Facebook second (phase 2) in the same design | Facebook needs App Review, a published privacy policy and a deletion callback, and may return no e-mail | both at once | two external reviews on one critical path |
| **DD-S06** Unlinking is not undoable (hard delete with an event); re-linking is the recovery | the row holds nothing a person cannot recreate in one click; a soft-deleted link would keep a provider subject on file for nothing | soft delete | retention of a provider identifier without purpose |

## Domain Vocabulary and Business Rules

| Term | Definition | Owner | Rule / failure |
|---|---|---|---|
| Identity link | A row binding (`provider`, `subject`) to one `auth:user`, with the e-mail observed at link time | `foundation` | one (`provider`, `subject`) per user and one user per (`provider`, `subject`); a second link of the same provider for the same user → 409 `identity_already_linked` (own link exists); a subject already bound to *another* user ends in the generic outcome with a fingerprint, never a code that reveals it |
| Sign-in method | A password, or an identity link | `foundation` | removing the last method (no password set, one link) → 409 `identity_last_method` |
| State marker | The single-use cache entry that binds an authorization round trip to a browser and a purpose (`sign_in` or `link:<userId>`) | `foundation` | missing, used or mismatched → the generic `identity=invalid` outcome |
| Generic outcome | The three `/login` outcomes `identity=unlinked`, `identity=invalid`, `identity=failed` render one sentence: "We could not sign you in with that account. Sign in with your e-mail, or connect the account in your profile."; the link flow's `/club/profile?identity=failed` renders "We could not connect that account." | `foundation` | the reason is logged with a fingerprint, never shown |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Guest on `/login` | start a sign-in with an enabled provider; receive the generic outcome | none before the lookup; the linked user's tenant and organization after it | none (`requireAuth: false`, `metadata.rateLimit` per IP) |
| Account holder (guardian, adult participant, staff, ward 16–17 with a limited account) | list, connect and disconnect own identities | the `self_user` grant (foundation spec DD-F03) | `foundation.identity.self` (implied by `people.self`); `start` checks it before choosing the link purpose |
| Club administrator | list and unlink any person's identities | `club_wide` | `foundation.identity.manage` (seeded on `vereino_club_admin`) |

A ward aged 16–17 keeps the limited account the administrator created (R10); the providers accept users from 13, so no extra rule is needed. Technical `admin`/`superadmin` of the platform get no Vereino feature and no identity link by default.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Installed seam | Why |
|---|---|---|---|
| `IdentityLink` entity | app-own on P-01 | — | no installed identity table outside the enterprise module |
| Session issuance | reuse | `AuthService.createSession(user, expiresAt)` + `signJwt`, cookies as in `api/autologin.ts`; `emitAuthEvent` (V-S01) | the platform owns sessions, logout and integrity checks |
| Login button | extend | injection spot `auth.login:form` (`frontend/login-injection.ts`), widget declared in the module-level `src/modules/foundation/widgets/injection-table.ts` (V-S03) | the same spot the enterprise `sso` widget uses |
| State marker | reuse pattern | platform cache, as `communication_channels/lib/oauth-state.ts` | replay protection exists |
| OAuth/OIDC client | new dependency `arctic` (Ask First, S16.1; V-S04) | — | no installed client |
| Rate limiting | reuse | `metadata.rateLimit` (IP) on `start`, `callback` and `deletion` | V-10 of the club spec; no per-subject limit (DD-S04) |
| Commands, errors, subscriber | reuse foundation + platform | `authorizeScoped` with the `self_user` grant (P-02, P-03), `errors(table)` (P-17), the platform subscriber `metadata` | the foundation's helpers and the platform's own shapes (DD-F14) |
| Profile section, admin section | extend | member layer (`Card`, `Button`, `useConfirmDialog`, `StatusBadge`), `CollapsibleSection`, `DataTable` | canonical components |

## Architecture and Data Flow

```text
/login [auth.login:form: "Sign in with Google"] ─► GET /api/foundation/identity/google/start?redirect=
   ─► no session → purpose sign_in; session + foundation.identity.self → purpose link:<userId>; session without the feature → 403
   ─► PKCE verifier + random state → cache marker {purpose, verifier, redirect} (10 min, single use) + cookie ─► 302 Google
Google ─► GET /api/foundation/identity/google/callback?code&state
   ─► consume marker (atomic; missing/used/cookie mismatch → identity=invalid)
   ─► arctic: code → tokens; id_token verified (signature, issuer, audience) → subject, email
   ─► purpose sign_in: lookup vereino_identity_links (provider, subject)   [the second entry of the DD-35 list, D27]
        found → AuthService.createSession(user) + signJwt → cookies → 302 /club ; foundation.identity.signed_in
        not found → 302 /login?identity=unlinked
   ─► purpose link:<userId> (started from /club/profile while signed in):
        subject free → command foundation.identity.link (authorizeScoped, self_user) → insert ; foundation.identity.linked ; 302 /club/profile
        subject bound to another user → 302 /club/profile?identity=failed + fingerprint foundation.identity.subject_conflict (nothing revealed)
/club/profile ─► GET /api/foundation/identity/me ─► list + canUnlink
             ─► DELETE /api/foundation/identity/{id} ─► command foundation.identity.unlink (authorizeScoped, self_user | club_admin) ─► identity_last_method guard ─► hard delete ; foundation.identity.unlinked
auth.user.deleted ─► subscriber foundation:identity-cleanup (platform metadata, persistent) ─► delete the user's links
Facebook (phase 2): same flow with arctic.Facebook (OAuth 2.0, Graph API /me?fields=id,email); email may be null
POST /api/foundation/identity/facebook/deletion (signed_request) ─► delete link by subject ─► { url, confirmation_code }
```

- **Boundaries:** the slice lives in `src/modules/foundation/identity/**`, except the module-level files discovery needs — the error table in `src/modules/foundation/lib/error-codes.ts` (one table per module, P-17), the widget in `widgets/injection-table.ts`, the features in `acl.ts`, the subscriber in `subscribers/` and the routes under `api/identity/**`; it imports `auth` only through the installed service and commands, `people` not at all; the identity commands target the `auth:user` through the `self_user` grant, so no person id is needed.
- **Compatibility:** the routes, error codes, events, the table and the `VEREINO_OAUTH_*` variables are protected from the first deployment (`BACKWARD_COMPATIBILITY.md` §2, §4, §5, §8).

## User Journeys

### Journey J-S01 — A guardian connects Google and signs in with it (phase 1)

1. Anna signs in with her invitation password, opens `/club/profile` → "Connected accounts" → "Connect Google". `start` runs with `purpose = link:<userId>`; after Google's consent the callback inserts the link and shows "Google connected" on the profile.
2. Next week she taps "Sign in with Google" on `/login`: the callback finds the link, issues the session and lands on `/club`.
3. Her phone is lost; the administrator opens her person record → "Sign-in methods" → "Unlink Google"; the next Google sign-in shows the generic outcome until she reconnects.

### Journey J-S02 — A coach without a link tries Google first (phase 1)

1. Tomek never connected Google. He taps "Sign in with Google"; the callback finds no link and redirects to `/login?identity=unlinked` with the generic sentence.
2. He signs in with his e-mail, connects Google in the profile, and the next time the button works.

### Journey J-S03 — A guardian uses Facebook that returns no e-mail (phase 2)

1. Marta connects Facebook from the profile; Facebook returns no e-mail; the link is stored with `email_at_link` null and shows "Facebook connected (no e-mail shared)".
2. She signs in with Facebook as with Google. Months later she deletes the Vereino app in Facebook; Facebook calls the deletion callback; the link disappears and the callback returns the confirmation code.

## UI and Interaction Contracts

### UI architecture

`/login` is the platform page with the injected buttons; `/club/profile` and the admin person record use the member layer and the backend components the foundation spec names (`MemberPage`, `Card`, `Button`, `useConfirmDialog`, `StatusBadge`, `CollapsibleSection`, `DataTable`). Semantic tokens only; provider logos as monochrome SVG tinted by `currentColor`.

| Surface | Behaviour | Data source and mutations | Reference | Canonical components | States | Requirement IDs |
|---|---|---|---|---|---|---|
| `/login` injection (`auth.login:form`) | one outline button per enabled provider under the password form; the generic sentence above the form when `?identity=` is present | `GET /api/foundation/identity/{provider}/start` | the enterprise `sso` widget on the same spot (read only) | `Button` (outline), brand SVG | provider disabled → no button; the sentence is identical for `unlinked`, `invalid`, `failed` | REQ-S01, REQ-S04 |
| `/club/profile` → "Connected accounts" | list (provider, e-mail at link or "no e-mail shared", linked date, last sign-in); "Connect …" per enabled provider not yet linked; "Disconnect" with confirmation; disabled with an explanation when it is the last method | `GET /api/foundation/identity/me`, `POST …/{provider}/link`, `DELETE …/{id}` | `/backend/profile` | `Card`, `Button`, `useConfirmDialog`, `StatusBadge` | loading, empty ("No connected accounts"), error with retry, 409 last method (explained), success flash | REQ-S02 |
| `/backend/people/persons/[id]` → "Sign-in methods" | the person's links; "Unlink" with `foundation.identity.manage` and a confirmation | `GET /api/foundation/identity?personId=`, `DELETE …/{id}` | `/backend/customers/people/[id]` (field groups) | `CollapsibleSection`, `DataTable` (small), `useConfirmDialog` | loading, empty, permission denied, 409 last method | REQ-S02 |

```text
/login                                         /club/profile — Connected accounts
┌──────────────────────────────┐               ┌───────────────────────────────────────────┐
│ ⓘ We could not sign you in   │               │ Google    anna@…   linked 2026-11-02      │
│   with that account. Sign in │               │           last sign-in 2026-11-09         │
│   with your e-mail, or       │               │           [Disconnect]                    │
│   connect the account in     │               │ Facebook  not connected   [Connect]       │
│   your profile.              │               │ ⓘ Disconnect is unavailable while this   │
│ E-mail    [___________]      │               │   is your only sign-in method.            │
│ Password  [___________]      │               └───────────────────────────────────────────┘
│ [Sign in]                    │
│ ───────── or ─────────       │
│ [G  Sign in with Google]     │
│ [f  Sign in with Facebook]   │
└──────────────────────────────┘
```

- **Responsive and accessibility:** buttons ≥ 44 px, full width at 375 px; the generic sentence in an `aria-live="polite"` region; confirmation dialogs with Cmd/Ctrl+Enter and Escape.
- **Localization:** `foundation.identity.*` keys in `src/modules/foundation/i18n/{en,pl}.json`; provider names untranslated.
- **Design-system and theming:** semantic tokens, light and dark, no hard-coded colours.

## Data Models

### `IdentityLink` / `vereino_identity_links`

| Fields | Indexes and uniqueness | Sensitive | Lifecycle and validation |
|---|---|---|---|
| `ScopedEntityBase` (P-01: `id`, `tenant_id`, `organization_id`, `created_at`, `updated_at`, `deleted_at`); `user_id` uuid (→ `auth:user`, scalar id); `provider` enum (`google`/`facebook`); `subject` text; `email_at_link` text? (P-09 `encryptedField`, no hash sibling — display only); `last_signed_in_at` timestamptz? | unique (`provider`, `subject`) — the sign-in lookup key (DD-S03); unique (`organization_id`, `user_id`, `provider`); (`organization_id`, `user_id`) | `email_at_link` encr.; `subject` is a provider identifier, not personal data on its own | created by the link command only (who linked it is the command log's `actorUserId`, so no `linked_by` column); `last_signed_in_at` updated by the callback; hard-deleted on unlink (DD-S06) and on `auth.user.deleted`; `deleted_at` unused (kept by the base) |

No table for OAuth state (DD-S04).

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` | `/api/foundation/identity/{provider}/start` | `requireAuth: false`; `metadata.rateLimit` 20/min/IP; no session → `sign_in`; a session holding `foundation.identity.self` → `link:<userId>`; a session without it → 403 | `?redirect=` (sanitized, same-origin) | 302 to the provider with PKCE (S256) and state; marker + cookie | 404 `identity_provider_disabled`; 503 `identity_unavailable` (state store unreachable — fail closed) | REQ-S01, REQ-S02, REQ-S04 |
| `GET` | `/api/foundation/identity/{provider}/callback` | `requireAuth: false`; `metadata.rateLimit` 20/min/IP | `?code=&state=` | `sign_in`: link found → session cookies as `autologin.ts`, 302 `/club` or the sanitized redirect, `foundation.identity.signed_in`, `last_signed_in_at` updated; `link:<userId>`: the command `foundation.identity.link` inserts the link, `foundation.identity.linked`, 302 `/club/profile` | marker missing/used/cookie mismatch → 302 `/login?identity=invalid`; provider error, token-endpoint timeout (5 s) or 5xx → 302 `/login?identity=failed` + fingerprint `foundation.identity.callback_failed`; `sign_in` without a link → 302 `/login?identity=unlinked`; `link` with a subject bound to another user → 302 `/club/profile?identity=failed` + fingerprint `foundation.identity.subject_conflict` (nothing revealed); `link` when the session expired meanwhile → 302 `/login?identity=invalid` | REQ-S01, REQ-S02, REQ-S04 |
| `GET` | `/api/foundation/identity/me` | auth + `foundation.identity.self` | — | `{ items: [{ id, provider, emailAtLink, emailShared, linkedAt, lastSignedInAt, updatedAt }], canUnlink, providers: [{ id, enabled, linked }] }` | — | REQ-S02 |
| `POST` / `foundation.identity.link` (platform `CommandHandler`; `execute` calls `authorizeScoped` with allowed kinds `['self_user']` and the marker (`ctx.auth.sub`) as the scope source; `isUndoable: false` — "the user repeats the click") | `/api/foundation/identity/{provider}/link` | auth + `foundation.identity.self` | — | 302 to `start` with `purpose = link:<userId>` | 404 provider disabled; 409 `identity_already_linked` (own link for this provider exists) | REQ-S02 |
| `DELETE` / `foundation.identity.unlink` (platform `CommandHandler`; `execute` calls `authorizeScoped` with allowed kinds `['self_user', 'club_admin']`; `isUndoable: false` — DD-S06) | `/api/foundation/identity/{id}` | auth + `foundation.identity.self` for own links, `foundation.identity.manage` for others | lock token (`updatedAt`) | 204; `foundation.identity.unlinked` | 409 `identity_last_method`; 409 `optimistic_lock_conflict`; 403 `scope_denied`; 404 | REQ-S02 |
| `GET` | `/api/foundation/identity?personId=` | auth + `foundation.identity.manage` | `personId` | list as `me` | 403; 404 | REQ-S02 |
| `POST` | `/api/foundation/identity/facebook/deletion` | `requireAuth: false`; `metadata.rateLimit` 10/min/IP | `signed_request` (HMAC-SHA256 with the app secret) | `{ url: "<status page>", confirmation_code }`; the link with that subject deleted; `foundation.identity.unlinked` | 400 on a bad signature (logged, no detail); idempotent — an unknown subject still returns a code | REQ-S03 |

Error codes, added to the module's one table (`src/modules/foundation/lib/error-codes.ts`, P-17): `identity_provider_disabled` (404), `identity_unavailable` (503), `identity_already_linked` (409), `identity_last_method` (409). The callback's failures are redirects, not coded errors: they are reported with the fingerprints `foundation.identity.state_invalid`, `foundation.identity.not_linked`, `foundation.identity.callback_failed`, `foundation.identity.subject_conflict`. Uncoded 500s carry no detail (S6.7).

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `foundation.identity.linked` / `unlinked` / `signed_in` (payload: `id`, `userId`, `provider`, `tenantId`, `organizationId` — ids only, S4.6) | `foundation` | `audit_logs`; phase 3 of the club spec: `communication` e-mails "a new sign-in method was added" to the account holder | audit entry; later an e-mail | key = identity id + event |
| `auth.user.deleted` | `auth` | `foundation:identity-cleanup` (platform subscriber `metadata`, `persistent: true`) | deletes the user's identity links | key = user id; a repeat finds nothing |
| Facebook deletion callback | Facebook | `foundation` | deletes the link by subject | idempotent by subject |

No scheduled job.

## Security, Privacy, and Compliance

- **Authorization:** `start` and `callback` are sessionless with IP rate limits; `start` chooses the link purpose only for a session that holds `foundation.identity.self`; every other route has a feature gate; the identity commands run `authorizeScoped` with the `self_user` grant (`club_admin` for the administrator's unlink); the administrator's list is scoped by `club_admin`.
- **Tenant isolation:** the only tenant-blind read is the (`provider`, `subject`) lookup — the second entry of the DD-35 list (DD-S03, D27, listed in `AGENTS.md`); it returns at most one row and every later query runs in that row's tenant and organization; the `link` purpose carries the signed-in user's id in the marker, never from the request.
- **OAuth hygiene:** PKCE S256; random 32-byte state; single-use marker consumed atomically; cookie `HttpOnly`, `SameSite=Lax`, `Secure`; id-token signature, issuer and audience verified by `arctic`; `redirect` sanitized to same-origin paths (`sanitizeRedirectPath` of `auth`); client secrets only in `VEREINO_OAUTH_<PROVIDER>_CLIENT_SECRET`. No nonce and no per-subject limit (DD-S04).
- **No enumeration, no JIT:** the three `/login` outcomes render one sentence and the link flow's failure another; the callback never says whether an identity or an e-mail exists, including when a subject is bound to another user; no account is created (DD-S02).
- **Sessions:** the platform's own cookies (`autologin.ts` pattern), so logout, refresh and `sessionIntegrity.ts` checks apply unchanged; `foundation.identity.signed_in` is emitted next to the platform's `auth` event.
- **Minors:** a ward aged 16–17 keeps the limited account (R10); Google and Facebook accept users from 13; the club's privacy notice names both providers as processors.
- **Failure modes (S3.6):** state store down → 503 on `start`, fail closed; provider authorization error, token-endpoint timeout (5 s) or 5xx → `identity=failed` + fingerprint; a session that expired between `link` and `callback` → `identity=invalid`; Facebook without an e-mail → link with `email_at_link` null; a deletion request with a bad signature → 400, logged.
- **Compliance:** Google OAuth consent screen (external) verified before production; Facebook App Review (`email`, `public_profile`), a published privacy policy URL and the registered deletion callback before phase 2 goes live; secrets never in the database or logs.

## Integration Coverage

Tests live in `packages/app/.ai/qa/tests/foundation/identity/`, are self-contained (own tenant, organization and users; cleanup in `finally`) and use an in-process OAuth/OIDC fake that `arctic` is pointed at through configurable endpoints (V-S04) — never the real providers.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-S01 | integration + security | fake Google; user U signed in; user V with no link; identity I linked to U; a tenant B user with the same provider subject attempted; a signed-in user without `foundation.identity.self` | U connects Google from the profile; V attempts a sign-in; sign-in with I; callback with reused and tampered state; `start` with the state store stopped; token endpoint timing out; a second link attempt for I's subject from tenant B; `start` by the user without the feature | link created with an ids-only event; V → `identity=unlinked`; I → cookies set and `/club` reached, `last_signed_in_at` updated; reused/tampered → `identity=invalid` with the same body as `unlinked`; store down → 503 and no cookie; timeout → `identity=failed`; tenant B → `/club/profile?identity=failed`, the fingerprint logged, no cross-tenant data and no code revealing the conflict; the user without the feature → 403; no `auth:user` created anywhere | REQ-S01, REQ-S04 |
| TEST-S02 | integration | signed-in user with a password; a user whose only method is Google; an admin with `foundation.identity.manage`; a user without the feature | list; unlink own; unlink the last method; admin unlinks another person's link; user without the feature calls the admin list | items and `canUnlink` correct; 204 + event; 409 `identity_last_method`; 204 + event; 403 | REQ-S02 |
| TEST-S03 | integration | fake Facebook returning no e-mail; a linked Facebook identity | link from the profile; sign-in with the link; deletion callback with a valid and an invalid signature | link with `email_at_link` null; `/club` reached; valid → link removed and a confirmation code; invalid → 400 and the link kept | REQ-S03 |
| TEST-S04 | UI | account with two links and one; provider disabled | `/login` and `/club/profile` at 375 px, keyboard, dark mode; disabled provider | buttons per enabled provider; the generic sentence announced; disconnect disabled with explanation for the last method; axe clean | REQ-S01, REQ-S02 |

## Implementation Phases

Validation for every phase: `yarn verify` (single gate), `yarn test:integration:vereino --filter TEST-S…`, SQL review from `yarn db:generate`; 100 % unit coverage for `src/modules/foundation/identity/lib/**` (S13.6).

### Phase 1 — Google

- **Depends on:** foundation spec phases A1 and A2 exit gates (P-01, P-02, P-03 with `self_user`, P-09, P-17, the member layer); the `arctic` dependency approved with S16.1 evidence (V-S04); a Google OAuth client in testing mode; D27 and REQ-040 merged (this PR).
- **Outcome:** J-S01 and J-S02 on a staging deployment.
- **Why this order / value delivered:** Google needs no external review for the gate; the whole mechanism is proven once.
- **Deliverables:** inside `src/modules/foundation/identity/`: `data/entities.ts`, `migrations/*`, `providers/{registry,google}.ts`, `lib/{state-marker,session}.ts`, `commands/{link,unlink}.ts`; at the module level (discovery): `api/identity/{start,callback,me,link,unlink,admin-list}/route.ts`, `subscribers/identity-cleanup.ts`, the identity rows of `lib/error-codes.ts`, the features in `acl.ts`, the widget in `widgets/injection-table.ts`; the profile section and the admin section; `foundation/i18n` keys; `.env.example` entries; the OAuth fake under `.ai/qa/tests/foundation/identity/_fixtures/`.
- **Steps:** 1. Dependency evidence and `arctic` pin; entity, migration (SQL in the PR), `encryptedField` for `email_at_link`. 2. Provider registry, state marker, `start`/`callback` with session issuance as `autologin.ts` (TEST-S01). 3. `me`, `link`, `unlink`, admin list, cleanup subscriber (TEST-S02). 4. Login injection, profile and admin sections, the generic sentence in en + pl (TEST-S04).
- **Independent slices / estimated commits:** (a) entity + provider 2 commits; (b) routes 2 commits; (c) UI 2 commits. (b) after (a); (c) after (b).
- **Requirements closed:** REQ-S01, REQ-S02, REQ-S04
- **Tests:** TEST-S01, TEST-S02, TEST-S04
- **Validation:** as above
- **Exit gate:** sign-in through the fake and through a real Google test user on staging; a reused state refused; no account created; `/login` and `/club/profile` checked in light and dark at 375 px.

### Phase 2 — Facebook

- **Depends on:** Phase 1 exit gate; Facebook App Review passed, the privacy policy published, the deletion callback URL registered.
- **Outcome:** J-S03.
- **Why this order / value delivered:** the second provider on a proven path; the external review must not block phase 1.
- **Deliverables:** `providers/facebook.ts` (OAuth 2.0, Graph `/me?fields=id,email`), the no-e-mail branch, `api/facebook/deletion/route.ts` (signed-request verification, confirmation code), the login button and profile entry.
- **Steps:** 1. Provider and the no-e-mail branch (TEST-S03). 2. Deletion callback. 3. Button and profile entry.
- **Independent slices / estimated commits:** 2 commits.
- **Requirements closed:** REQ-S03
- **Tests:** TEST-S03
- **Validation:** as above
- **Exit gate:** sign-in through the fake and a real Facebook test user; the deletion callback removes the link.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-S01 | J-S01, J-S02, `/login` | `vereino_identity_links`, `start`, `callback`, `foundation.identity.signed_in` | 1 | TEST-S01, TEST-S04 | AC-S01 |
| REQ-S02 | J-S01, `/club/profile`, person record | `me`, `link`, `unlink`, admin list, `identity_last_method`, `identity_already_linked`, `foundation.identity.linked|unlinked`, `foundation:identity-cleanup` | 1 | TEST-S02, TEST-S04 | AC-S02 |
| REQ-S03 | J-S03 | `providers/facebook`, `deletion` route | 2 | TEST-S03 | AC-S03 |
| REQ-S04 | every sign-in attempt | state marker, PKCE, the generic outcome, `identity_unavailable` | 1 | TEST-S01 | AC-S04 |

## Rollout, Migration, and Rollback

- **Migration:** one additive migration for `vereino_identity_links` (phase 1), `down()` drops it; applied only with approval; rollback never runs `down()` in production (S14.6).
- **Configuration:** `VEREINO_OAUTH_GOOGLE_CLIENT_ID`, `VEREINO_OAUTH_GOOGLE_CLIENT_SECRET`, `VEREINO_OAUTH_FACEBOOK_CLIENT_ID`, `VEREINO_OAUTH_FACEBOOK_CLIENT_SECRET`, `VEREINO_OAUTH_REDIRECT_BASE_URL` (defaults to the app URL); a provider without a client id is disabled and its button hidden — the feature flag; `CACHE_STRATEGY=redis` when replicas > 1; `RATE_LIMIT_TRUST_PROXY_DEPTH` set on Railway.
- **Operational prerequisites:** Google consent-screen verification before production (testing mode allows 100 test users meanwhile); Facebook App Review, privacy policy URL and deletion callback before phase 2.
- **Observability:** fingerprints `foundation.identity.callback_failed`, `foundation.identity.state_store_unavailable`, `foundation.identity.deletion_bad_signature`.
- **Rollback:** unset the provider variables — buttons disappear, links stay harmless; reverting the PR leaves an unused table.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| `arctic` abandonment or a breaking release | sign-in breaks on upgrade | exact pin, Renovate from E2, the OAuth fake, a thin provider interface so a swap is one PR | a replacement would cost one PR |
| State replay across replicas with the memory cache | an attacker reuses a state | `CACHE_STRATEGY=redis` required when replicas > 1 (as `communication_channels`); documented in Rollout | single-replica deployments safe by construction |
| The (`provider`, `subject`) lookup is tenant-blind | a second class of system-scope read | unique index, at most one row, immediate narrowing, listed in `AGENTS.md` (D27); TEST-S01 cross-tenant case | accepted by the owner |
| A user without a password and one link loses the provider account | locked out | `identity_last_method` prevents self-removal; the administrator can unlink and re-invite (reset flow) | support effort |
| First social sign-in needs an e-mail sign-in and one "Connect" click (DD-S02) | friction | the generic sentence names the two ways in; the invitation e-mail says "connect Google afterwards" | some users will ask the administrator |
| Facebook returns no or an unverified e-mail | none for sign-in (no matching) | `email_at_link` nullable; display "no e-mail shared" | none |
| External reviews slip | phase 2 late | phase 2 isolated; phase 1 runs in testing mode until verified | none for phase 1 |

## Acceptance Criteria

- [ ] **AC-S01** — A person with a linked Google identity signs in from `/login` with one click and reaches `/club` with the platform's session; `last_signed_in_at` is updated and the event carries ids only.
- [ ] **AC-S02** — A signed-in person connects and disconnects providers in `/club/profile`; the last sign-in method cannot be removed (409); the administrator unlinks any person's identity; deleting the `auth` user removes its links.
- [ ] **AC-S03** — Facebook sign-in and linking work with and without an e-mail; the deletion callback removes the link and returns a confirmation code; a bad signature is refused.
- [ ] **AC-S04** — A sign-in without a link, a replayed or tampered state, an unreachable state store and a provider failure each end without a session and without an account, showing the same generic sentence; no response reveals whether an identity or an e-mail exists.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (system-scope rule and the D27 exception), `.ai/guides/spec-delivery.md`, `backend-ui.md`, the engineering standards (S3.6, S4, S6.7, S13, S16.1), the lesson `enterprise-package-is-commercial`, skill `om-spec-writing` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | REQ-S01…S04 each with a phase, a test and an AC; DD-S01…S06, J-S01…S03, TEST-S01…S04, AC-S01…S04 defined once |
| Every workflow completes end to end without a catch-all integration phase | pass | J-S01…J-S03 complete within phases 1–2 |
| Platform-native reuse and extension points were chosen before custom code | pass | session, login spot, state pattern, rate limits and the foundation primitives reused; only the table and the OAuth client are new |
| UI contracts identify references, canonical components, and theme/state coverage | pass | three surfaces with references, components, states and a mock-up |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | phases 1–2 |
| Contracts of installed modules confirmed at the field and behavior level | pass (V-S04 open) | V-S01 (`AuthService.createSession` + `signJwt`, `autologin.ts`, `login.ts:186`), V-S02 (no OAuth in core `auth`; enterprise `sso` is OIDC/SAML only), V-S03 (`auth.login:form` spot); V-S04 (`arctic`) confirmed in phase 1 step 1 |
| User approval for implementation | fail | pending: the product owner's approval on the PR; the `arctic` dependency (Ask First, S16.1 evidence) |

Verdict: `Blocked — the product owner's approval of the design on the PR, the arctic dependency approval, and V-S04`

## Open Questions

Answered by the product owner on 2026-10-27 in the foundation spec's gate (its Q8–Q11, Q13) and carried here:

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-S01 | Scope: 1.0 or Later? | Władek Kuć | yes | **1.0 as Should, for account holders; brief decision D27 and club spec REQ-040** — 2026-10-27 |
| Q-S02 | Mechanism | Władek Kuć | yes | **Own slice on `arctic`; no enterprise `sso`, no external IdP** (DD-S01) — 2026-10-27 |
| Q-S03 | Providers and audience | Władek Kuć | yes | **Google first, Facebook second; invited account holders only, wards with their limited account** (DD-S05) — 2026-10-27 |
| Q-S04 | Linking rule | Władek Kuć | yes | **From a signed-in session or by the administrator; no JIT, no e-mail matching** (DD-S02; narrowed from "verified e-mail at first sign-in" by the architectural review) — 2026-10-27 |
| Q-S05 | May the (`provider`, `subject`) lookup join the DD-35 list? | Władek Kuć | yes | **Yes — D27; club spec DD-35 and `AGENTS.md` amended in this PR** (DD-S03) — 2026-10-27 |

Contract verifications:

| ID | What to check | Phase | Result |
|---|---|---|---|
| V-S01 | Session issuance for a user without a password check | 1 | **Confirmed 2026-10-27:** `core/modules/auth/api/autologin.ts` (`AuthService.createSession(user, expiresAt)` + `signJwt`, cookies on the redirect, `emitAuthEvent`); `api/login.ts:186` |
| V-S02 | Any installed OAuth/OIDC client or social login in the enabled modules | 1 | **Confirmed absent 2026-10-27:** no OAuth/OIDC code in `@open-mercato/core` or `shared`; `enterprise/src/modules/sso` is OIDC/SAML with SCIM and JIT (commercial, not usable) |
| V-S03 | A place to inject the buttons on `/login` | 1 | **Confirmed 2026-10-27:** injection spot `auth.login:form` (`core/modules/auth/frontend/login-injection.ts`) |
| V-S04 | `arctic` supports Google (OIDC, PKCE) and Facebook (OAuth 2.0) with endpoints configurable for a test fake, and verifies the id token's signature, issuer and audience | 1 | **Open — phase 1 step 1 with the dependency evidence;** fallback: `openid-client` for Google and a small OAuth 2.0 code exchange for Facebook behind the same provider interface |

## Changelog

| Date | Change |
|---|---|
| 2026-10-27 | Split out of `2026-10-27-vereino-foundation-primitives.md` (its phases C–D, P-20, DD-F09…F11, DD-F13, J-F02, TEST-F12/F13/F15, AC-F15, Q8–Q11, Q13, V-F01/F03/F04) after the scope-cohesion review; renumbered REQ-S, DD-S, J-S, TEST-S, AC-S, Q-S, V-S; linking narrowed to a signed-in session (DD-S02); the DD-35 extension approved as D27 (DD-S03) |
| 2026-10-27 | Third review round applied (foundation Q15): the OIDC nonce and the per-subject callback rate limit dropped (DD-S04); `linked_by` and `email_verified_at_link` columns dropped; `start` checks `foundation.identity.self` before choosing the link purpose; a subject bound to another user ends in the generic link failure with a fingerprint instead of 409; `identity_state_invalid` and `identity_not_linked` moved from the error table to fingerprints; the identity commands are platform `CommandHandler`s using `authorizeScoped` with the `self_user` grant (foundation DD-F03, DD-F14); the cleanup subscriber uses the platform `metadata` shape; module-level paths for the error table, widget, features, subscriber and routes; V-S04 no longer requires nonce support |
| 2026-10-27 | Foundation I DD-F18 (review of both foundation specs): `prepareScoped` renamed `authorizeScoped` and called from `execute`, not `prepare`; the marker source reads `ctx.auth.sub` only |
