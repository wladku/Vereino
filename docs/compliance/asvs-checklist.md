# OWASP ASVS 5.0 level 2 checklist

> **Status: draft — not approved.** Approved by the product owner on: _(date)_.

Engineering standards S8.1: Vereino targets OWASP ASVS 5.0 level 2 for everything that handles personal or payment
data, and this file maps the applicable requirements to a control or a test. Source: OWASP Application Security
Verification Standard 5.0.0, published 30 May 2025 —
<https://github.com/OWASP/ASVS/raw/v5.0.0/5.0/OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf> (chapter
and section titles taken from the release's CSV,
<https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv>,
read 2026-11-21).

## How to read it

- This first version maps **sections**, not each of the ~350 requirements. A section is **met** only when a named
  test or file proves it; otherwise it is **partial** (the control exists, a gap is named), **gap** (no control yet,
  with the issue or decision that owns it), **to verify** (a control is designed but no evidence was collected) or
  **n/a** (the feature does not exist in Vereino, with the reason).
- Requirement-level mapping (each `V<chapter>.<section>.<n>` at level 1 and 2) is the next step before the pilot:
  open item **A-1**. The section rows below say where to look.
- Platform behaviour (authentication, sessions, CSRF) comes from the platform spike of phase E3 (#448) and is
  recorded in the engineering standards' open questions; Vereino does not patch platform code (S3.1).

## Map

| ASVS 5.0 section | Vereino control | Evidence or test | State |
|---|---|---|---|
| V1.1–V1.3 Encoding, injection prevention, sanitization | MikroORM parameterised queries; React escaping; no raw SQL built from input (S5) | `yarn lint` (typed rules) in `yarn verify` | to verify |
| V1.4 Memory, unmanaged code | — | — | n/a (TypeScript only) |
| V1.5 Safe deserialization | Zod validators on every route body (`data/validators.ts`) | route integration tests | to verify |
| V2.1–V2.3 Validation and business logic | Zod schemas per route; business rules in `lib/` with 100 % unit coverage (AGENTS.md); commands with optimistic locking and 409 on conflict | `yarn test`, module integration tests | partial — documentation of business-logic limits per flow is open |
| V2.4 Anti-automation | rate limits through the platform `lib/ratelimit` on every sessionless and sign-in route (S8.6, #738): per client in each route's `metadata.rateLimit`, per token and per address within a club in the handlers, per account on sign-in and password reset; counters in Redis on Railway (boot check); see *Sessionless route inventory* below; honeypot and time trap on public forms | `ISSUE-738-sessionless-rate-limits` (429 with `Retry-After` on sign-in, password reset and each public route family); facilities and payments public-route integration tests; `vereino-boot-env` unit tests | met — the per-client counters separate clients only once `RATE_LIMIT_TRUST_PROXY_DEPTH` is measured and set per environment (A-6) |
| V3.1–V3.2 Frontend documentation, content interpretation | upload rules S8.11 (no SVG; re-encoded images); `X-Content-Type-Options` | `next.config.ts` headers | to verify |
| V3.3 Cookie setup | platform session cookie `Secure`, `HttpOnly`, `SameSite=Lax` (S8.5, checked in E3) | E3 spike notes (#448) | to verify on production |
| V3.4 Browser security headers | CSP, `X-Frame-Options`, `Referrer-Policy` in `packages/app/next.config.ts` | `next.config.ts` | **gap** — `Strict-Transport-Security` and `Permissions-Policy` are not set yet and the production CSP still has `'unsafe-eval'` (S8.4, phase E4) |
| V3.5 Origin separation | no state-changing `GET` (S8.9); cross-site JSON `POST` protection as found in E3 | E3 spike notes | to verify |
| V3.6 External resource integrity | only `https://js.stripe.com` is loaded from outside (CSP `script-src`) | `next.config.ts` | to verify (Stripe does not support SRI for `js.stripe.com`; document the exception) |
| V3.7 Other browser considerations | token pages send `Referrer-Policy: no-referrer`, `noindex`, `private, no-store` (S8.6) | public-route integration tests | to verify |
| V4.1–V4.2 Generic web service, HTTP message validation | `makeCrudRoute` and per-method `metadata` + `openApi` on every route (AGENTS.md); `contracts:check` | `yarn verify` step `contracts:check` | to verify |
| V4.3 GraphQL, V4.4 WebSocket | — | — | n/a (none used) |
| V5.1–V5.3 File upload and storage | S8.11: allowlisted MIME, extension and magic bytes, size limits, no SVG, bank statements only in the private attachments partition, file names never used as paths | attachments integration tests | to verify |
| V5.4 File download | attachment access through the platform `attachments` module and its ACL | — | to verify |
| V6.1–V6.3 Authentication documentation, passwords, general | platform `auth` only (S8.2); sign-in rate limits of the platform (per client, per client and address) and Vereino's per-account limit (#738) | E3 spike notes | to verify |
| V6.4 Factor lifecycle and recovery | platform password reset; Vereino personal links are not a sign-in factor (S8.7) | — | to verify |
| V6.5–V6.7 Multi-factor, out-of-band, cryptographic authentication | none in 1.0: the platform's MFA is in the commercial enterprise module (ADR-023) | ENG-Q-09 (default: no MFA in 1.0) | **gap** — accepted risk pending the owner's ENG-Q-09 decision; level 2 expects MFA for administrators |
| V6.8 Identity provider | social sign-in is not enabled in 1.0 | — | n/a until `.ai/specs/2026-10-27-vereino-social-sign-in.md` ships |
| V7.1–V7.2 Session documentation and fundamentals | platform sessions | E3 spike notes | to verify |
| V7.3 Session timeout | E3 found an 8-hour non-sliding session (30 days with "remember me"), no idle timeout | ENG-Q-12 | **gap** — owner decision ENG-Q-12 pending; S8.5 target is ≤ 30 min idle for staff |
| V7.4 Session termination | platform sign-out | — | to verify |
| V7.5 Session abuse defences | no re-authentication before an e-mail change (E3) | ENG-Q-12 | **gap** — as V7.3 |
| V7.6 Federated re-authentication | — | — | n/a (no federation in 1.0) |
| V8.1–V8.3 Authorization design and operation level | `requireFeatures` with feature ids, never role names; record scope from `people.scopeService`; tenant and organization derived on the server and fail-closed (S8.3, AGENTS.md) | every route's second-tenant and insufficient-feature integration test (S13.4) | partial — S13.4 tests exist per module; a route-by-route inventory is open (A-2) |
| V8.4 Other authorization | sessionless routes: one system-scope lookup by slug or token hash, then narrowed (S8.6, D-024/D-026/D-027) | public-route integration tests | to verify |
| V9.1–V9.2 Self-contained tokens | platform JWT session | E3 spike notes | to verify |
| V10 OAuth and OIDC | Stripe is reached with API keys, not OAuth; no social sign-in in 1.0 | — | n/a |
| V11.1 Cryptographic inventory | personal-link tokens: 32 random bytes, SHA-256 stored, constant-time compare (S8.7, `foundation/lib/token-link.ts`); PESEL and external ids stored as hashes for lookup (`people_persons.pesel_hash`, `external_id_hash`); backups encrypted with `age` ([`backups.md`](../ops/backups.md)) | `foundation` unit tests | partial — a written inventory of all keys and their rotation is open (A-3) |
| V11.2–V11.6 Implementation, algorithms, hashing, random, public key | Node `crypto` only, no hand-written cryptography (AGENTS.md "Never: ad hoc crypto") | unit tests of `token-link.ts` | to verify |
| V11.7 In-use data cryptography | — | — | n/a at level 2 |
| V12.1–V12.2 TLS, HTTPS to external services | Railway terminates TLS; Stripe, Resend and the backup bucket over HTTPS | — | to verify; HSTS gap as V3.4 |
| V12.3 Service to service | PostgreSQL and Redis on Railway's private network | [`deploy.md`](../ops/deploy.md) | to verify |
| V13.1–V13.2 Configuration documentation, backend configuration | `.env.example`; boot-time variable validation that refuses to start (S8.10, #462) | `scripts/` boot-check tests | partial |
| V13.3 Secret management | Railway sealed variables; restricted Stripe keys; GitHub secret scanning with push protection (S8.10) | [`github-settings.md`](../ops/github-settings.md) | to verify |
| V13.4 Information leakage | errors return codes from `lib/error-codes.ts`, never stack traces or personal data (S6.7, S9.4) | — | to verify |
| V14.1–V14.2 Data protection documentation and general | this compliance pack: [`ropa.md`](ropa.md), [`retention.md`](retention.md); minimisation S9.4; `private, no-store` on authenticated responses (S8.4) | — | partial — retention jobs missing, see `retention.md` |
| V14.3 Client-side data protection | no tokens in `localStorage` (S8.5) | — | to verify |
| V15.1–V15.2 Architecture and dependencies | Renovate with a 5-day cooldown, licence allowlist, pinned platform packages (S16); module boundaries (AGENTS.md) | `renovate.json`, `yarn verify` | partial |
| V15.3 Defensive coding | TypeScript strict; typed lint | `yarn typecheck`, `yarn lint` | met (gate steps) |
| V15.4 Safe concurrency | `FOR UPDATE` sequences (S10.5), version checks and 409s, idempotent jobs (S15.8) | payments integration tests | to verify |
| V16.1–V16.2 Security logging, general logging | structured pino logs, no personal data in logs (S15.1) | — | to verify |
| V16.3 Security events | platform audit log (`audit_logs` module, `action_logs`); anonymisation writes an audit row (S9.6) | — | to verify |
| V16.4 Log protection | Railway logs kept 7 days on Hobby, access limited to the project members ([`monitoring.md`](../ops/monitoring.md)) | — | partial — 7-day retention is shorter than an investigation may need; export on incident (`incident.md`) |
| V16.5 Error handling | `reportError` with fingerprints (S15.2) | — | to verify |
| V17 WebRTC | — | — | n/a (not used) |

## Sessionless route inventory

Every route a stranger can reach without a session, with its limits (#738; engineering standards S8.6). *Per client*
is counted by the API dispatcher from the route's `metadata.rateLimit` and keyed by the client address
(`RATE_LIMIT_TRUST_PROXY_DEPTH`); the other layers are counted in the handler through the foundation
(`foundation/services/sessionless-limits.ts`), keyed by a SHA-256 hash of the token or address. Over a limit the answer
is 429 with `Retry-After`, except where the route always answers a uniform 202: there the work is skipped silently.
Refusals are logged with the limiter key prefix only — no address, token or e-mail.

Accepted trade-off: a per-account counter can be spent by anyone who knows the address, so a stranger can hold one
account's sign-in for at most 15 minutes (10 attempts) and its password-reset e-mails for an hour (3 requests). That is
the price of stopping guesses spread across many clients; a successful sign-in clears the counter.

| Route family | Routes | Per client | Per subject |
|---|---|---|---|
| Sign-in (platform `auth`, `src/app/api/auth/login/route.ts`) | `POST /api/auth/login` | platform: 20 / min per client, 5 / min per client and address | 10 / 15 min per account from any client (cleared by a successful sign-in) |
| Password reset (platform `auth`, `src/app/api/auth/reset/route.ts`) | `POST /api/auth/reset`; `POST /api/auth/reset/confirm`, `/validate` | platform: 10 / min per client, 3 / min per client and address; confirm and validate per client | 3 / hour per address from any client (request only) |
| Social sign-in (`foundation`) | `GET /api/foundation/identity/providers`; `GET /api/foundation/identity/{provider}/start`, `/callback` | 120 / min; 20 / min; 20 / min | — |
| Public club pages (`club_core`) | `GET /api/club_core/public/{clubSlug}` and its `logo`, `events`, `events/{eventSlug}` (+ `files/{fileId}`), `sections/{sectionSlug}` (+ `logo`, `materials/{materialId}`), `places/{placeSlug}/files/{fileId}`; the server-rendered `/p/{clubSlug}/**` pages through the same limits | 120 / min each | — |
| Public places (`facilities`) | `GET /api/facilities/public/{clubSlug}/places`, `places/{placeSlug}/schedule` | 120 / min each | — |
| Booking requests (`facilities`) | `POST /api/facilities/public/{clubSlug}/places/{placeSlug}/requests` | 10 / 10 min | 5 / hour per address (fails closed, V-10) |
| Booking and rental links (`facilities`) | `POST /api/facilities/public/requests/verify`, `rentals/cancel/preview`, `rentals/cancel` | 30 / 10 min each | 30 / min per token (verify, cancel); 60 / min per token (preview) |
| Public sessions (`activities`) | `GET /api/activities/public/{clubSlug}/sessions/{occurrenceId}` | 120 / min | — |
| Declaration links (`activities`) | `POST /api/activities/declaration-links` (uniform 202); `GET`, `POST /api/activities/declaration-links/{token}` | 10 / 15 min; 60 / min; 30 / min | 3 / hour per address within a club (silent); 60 / min read, 30 / min write per token |
| Order campaigns (`payments`) | `GET /api/payments/public/order-campaigns/{id}`; `POST …/{id}/link-request` (uniform 202) | 60 / min; 10 / 15 min | — ; 3 / hour per address within a club (silent) |
| Order links (`payments`) | `GET /api/payments/order-links/{token}`; `POST …/{token}/orders`, `…/orders/{id}/cancel` | 60 / min; 30 / min | 60 / min read, 30 / min write per token |
| Test only (`ratelimit_probe`, not a Vereino module) | `POST /api/ratelimit_probe/ping` | 3 / min | — |

## Open items

| Id | What | Blocks |
|---|---|---|
| A-1 | Map every level 1 and 2 requirement of the applicable sections to a test or control | owner approval of this checklist |
| A-2 | Route-by-route inventory of the second-tenant and insufficient-feature tests (S13.4) | V8 met |
| A-3 | Cryptographic key inventory with rotation (session secret, Stripe keys, backup key, token hashing) | V11.1 met |
| A-4 | HSTS, `Permissions-Policy`, CSP without `'unsafe-eval'` (S8.4, phase E4) | V3.4 met |
| A-5 | Owner decisions ENG-Q-09 (MFA) and ENG-Q-12 (session lifetime) | V6.5, V7.3, V7.5 |
| A-6 | Measure the Railway proxy depth on staging, set `RATE_LIMIT_TRUST_PROXY_DEPTH` on staging and production, and record two clients with separate sign-in counters in a run log (`docs/ops/deploy.md` → *Rate limits*; #738) | per-client limits in production |
