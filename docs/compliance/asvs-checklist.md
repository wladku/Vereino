# OWASP ASVS 5.0 level 2 checklist

> **Status: refreshed 2026-11-25 (#742), waiting for the product owner's approval.** Approved by the product owner
> on: _(date)_.

Engineering standards S8.1: Vereino targets OWASP ASVS 5.0 level 2 for everything that handles personal or payment
data, and this file maps the applicable requirements to a control or a test. Source: OWASP Application Security
Verification Standard 5.0.0, published 30 May 2025 —
<https://github.com/OWASP/ASVS/raw/v5.0.0/5.0/OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf> (chapter
and section titles taken from the release's CSV,
<https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv>,
read 2026-11-21 and again 2026-11-25).

## How to read it

- This file maps **sections**; [`asvs-requirements.md`](asvs-requirements.md) maps each of the 253 level 1 and 2
  requirements (`V<chapter>.<section>.<n>`) with its evidence and owner (open item A-1, closed by #742). A section row
  summarises its requirements; when the two disagree, the requirement row wins.
- A section is **met** only when a named test, `yarn verify` step or file proves every level 1 and 2 requirement in
  it; otherwise it is **partial** (the control exists, a gap is named), **gap** (no control yet), **to verify** (a
  control is designed but no evidence was collected) or **n/a** (the feature does not exist in Vereino, with the
  reason). Sections with level 3 requirements only are outside the level 2 target and are marked so.
- **Owner** is the issue that closes the row. Every row that is not met or n/a has one: the E25 stories of epic #734
  (#735–#744), #747, #779, or **#743**, the independent security review, whose internal pass collects evidence for every
  "to verify" no story covers.
- Platform behaviour (authentication, sessions, CSRF) comes from the platform spike of phase E3 (#448,
  `.ai/runs/2026-11-20-issue-448-platform-spike-e3.md`) and the installed platform source; Vereino does not patch
  platform code (S3.1).
- Hosting facts follow decision **D-039** (PR #725): production on Railway Pro in EU West — encryption at rest, TLS at
  the edge and WireGuard on the private network, sealed variables, logs kept 30 days, two-factor sign-in enforceable
  for the workspace. They hold for production once the owner has upgraded the plan and #735 has applied the
  lock-down checklist; until then the rows that rest on them stay **to verify**.

## Map

| ASVS 5.0 section | Vereino control | Evidence or test | State | Owner |
|---|---|---|---|---|
| V1.1–V1.3 Encoding, injection prevention, sanitization | React escaping; MikroORM and raw SQL with `?` parameters only (S5.8); user links limited to http(s); hex-only club colour; no eval in production | `ENG-TEST-11-security-headers` (no `'unsafe-eval'`), `club_core/lib/__tests__/publication.test.ts`, `club-accent.test.mjs`, `file-format.test.mjs` | partial — no lint guard against raw-HTML sinks, S5.8 not enforced by a gate (raw SQL also in `club_core/services/club-offboarding.ts`); SSRF and mail-header handling to verify | #743 |
| V1.4 Memory, unmanaged code | money as bounded integers (`payments/data/validators.ts`); managed runtime | `amountSchema` (`.int().max(MAX_AMOUNT)`) | met (V1.4.1 and V1.4.3 n/a: TypeScript only) | — |
| V1.5 Safe deserialization | `JSON.parse` into plain data, then Zod; XLSX parts with a DOCTYPE refused | `people/lib/__tests__/import-file.test.ts` | met | — |
| V2.1–V2.3 Validation and business logic | Zod schemas on every route, validated on the server; status machines in `packages/core/src/transitions.ts`; locks against double booking | `TEST-036-request-security`, `TEST-085-concurrent-internal-bookings`, `ISSUE-549-concurrent-cash-acceptances`, `yarn test` | partial — no per-flow document of validation rules and business limits; transaction rollback not tested | #743 |
| V2.4 Anti-automation | rate limits through the platform `lib/ratelimit` on every sessionless and sign-in route (S8.6, #738): per client in each route's `metadata.rateLimit`, per token and per address within a club in the handlers, per account on sign-in and password reset; counters in Redis on Railway (boot check); see *Sessionless route inventory* below; honeypot and time trap on public forms | `ISSUE-738-sessionless-rate-limits` (429 with `Retry-After` on sign-in, password reset and each public route family), `TEST-036-request-security`, `vereino-boot-env` unit tests | partial — the per-client counters separate clients only once `RATE_LIMIT_TRUST_PROXY_DEPTH` is measured and set per environment (A-8); no edge rate limiting (#739) | #739 |
| V3.1 Frontend documentation | — | — | outside level 2 (level 3 only) | — |
| V3.2 Content interpretation | `nosniff` everywhere; `sandbox` CSP on attachment files; file types from magic bytes; React text rendering | `ENG-TEST-11-security-headers`, `packages/core/src/file-format.ts` | partial — no lint rule keeps raw-HTML sinks out | #743 |
| V3.3 Cookie setup | platform session cookies `Secure`, `HttpOnly`, `SameSite=Lax` (spike #448, observed on the production build); sign-in state cookie `HttpOnly` | E3 spike notes, `foundation/services/identity.ts` | partial — no `__Host-` prefix (matters with club subdomains, D-036); `om_selected_*` cookies not checked | #744 |
| V3.4 Browser security headers | HSTS (`max-age=63072000; includeSubDomains`), `Permissions-Policy`, production CSP without `'unsafe-eval'`, `X-Frame-Options`, `Referrer-Policy`, `nosniff` in `packages/app/next.config.ts` (#463, closes A-4) | `ENG-TEST-11-security-headers` | partial — HSTS, `Permissions-Policy` and the CSP without `'unsafe-eval'` are met; left: `script-src 'unsafe-inline'` (nonce CSP deferred), broad `connect-src`/`img-src`, no `frame-ancestors` on the attachment-file CSP | #743 |
| V3.5 Origin separation | no state-changing `GET` (S8.9); cookie-authenticated `/api` mutations from a foreign `Origin` or with `Sec-Fetch-Site: cross-site` refused with 403 in `src/proxy.ts` (ENG-Q-11, #744), bearer, API-key and webhook requests exempt; `SameSite=Lax` below it; each club on its own subdomain (D-036) | `ISSUE-744-cross-site-api-check`, `packages/core/src/__tests__/cross-site-request.test.mjs` | partial — V3.5.1 and V3.5.2 met (#744); left: no app-wide test that `GET` changes nothing (V3.5.3) and club host separation not live (V3.5.4) | #743 |
| V3.6 External resource integrity | only `https://js.stripe.com` loaded from outside | `next.config.ts` | outside level 2 (level 3 only); Stripe does not support SRI | — |
| V3.7 Other browser considerations | Next.js and React only; sign-in redirects kept to the same origin | `TEST-S01-google-sign-in` (refuses a foreign redirect) | partial — the platform `/login` redirect is not covered by a Vereino test | #743 |
| V4.1–V4.2 Generic web service, HTTP message validation | per-method `metadata` + `openApi` on every route (AGENTS.md); JSON through `Response.json` | — | to verify — content types, edge redirects, proxy headers and message boundaries not checked on a deployment (`contracts:check` checks error codes and catalogs, not HTTP handling) | #743 |
| V4.3 GraphQL, V4.4 WebSocket | — | — | n/a (none used) | — |
| V5.1–V5.3 File upload and storage | S8.11: formats from magic bytes, size limits, no SVG, XLSX entry and inflated-size limits, uploads only in the private attachments partition, served through route handlers | `packages/core/src/file-format.ts` + `file-format.test.mjs`, `people/lib/__tests__/import-file.test.ts` | partial — no single upload inventory; platform storage paths to verify | #743 |
| V5.4 File download | generated names and RFC 6266 encoding on Vereino routes; platform `attachments` ACL | `facilities/api/incidents/[id]/photos/[photoId]/route.ts` | **gap** — no malware scan, yet staff-uploaded PDFs (section materials, place regulations) are served on public pages, contrary to S8.11's premise | #743 |
| V6.1–V6.3 Authentication documentation, passwords, general | platform `auth` (S8.2): bcrypt passwords, change needs the current password, masked fields; sign-in limits of the platform (per client, per client and address) and Vereino's per-account limit, documented in *Sessionless route inventory* (#738) | `ENG-TEST-16-login-accessibility`, `E06-S22-profile-wards-guardians`, `ISSUE-738-sessionless-rate-limits`, E3 spike notes | **partial** — production password policy of 12 characters without class rules and a first deploy without default accounts in `deploy.md` (#747); the platform's browser forms still demand the default classes, and no common, breached or context-word check exists (#779); staging and production not yet checked for default accounts (A-7); per-client sign-in limits share one counter until the proxy depth is set (A-8); no second factor (#736) | #747, #779 |
| V6.4 Factor lifecycle and recovery | invitations and resets as 32-byte hashed single-use links (S8.7); platform reset ends all sessions | `TEST-F04-create-account` | to verify — the reset flow is code-read only | #743 |
| V6.5–V6.6 Multi-factor, out-of-band | ENG-Q-09 re-decided 2026-11-26 (#736): administrators and treasurers sign in with Google (#566) or a password plus a 6-digit e-mail code (CSPRNG, hashed, 10 min, single use, 5 attempts, 5 challenges per user per hour); reset by an administrator or the operator — designed in `.ai/specs/2026-11-26-vereino-staff-second-factor.md`, not yet built | planned `TEST-2F01-staff-email-code`, `TEST-2F03-google-and-reset` | **gap** until phase 1 ships — level 2 expects a second factor for administrators | #736 |
| V6.7 Cryptographic authentication | — (no certificates or hardware keys; the staff second factor of #736 is Google or an e-mail code) | — | outside level 2 (level 3 only) | — |
| V6.8 Identity provider | Google sign-in (#566, shipped in #610): links by (`provider`, `subject`) only, `iss`/`aud`/`azp`/`exp` checked | `TEST-S01-google-sign-in`, `foundation/lib/__tests__/identity.test.ts` | partial — the id token's signature is not checked by decision V-S04 (TLS back channel) | #743 |
| V7.1–V7.2 Session documentation and fundamentals | platform JWT plus a session row checked on every request; new token per sign-in | `TEST-L01-account-state-and-actions` (`TEST-L02`), E3 spike notes | partial — lifetimes, concurrent sessions and federated session coordination not decided or documented (ENG-Q-12) | #737 |
| V7.3 Session timeout | E3 found an 8-hour non-sliding session (30 days with "remember me"), no idle timeout | ENG-Q-12 | **gap** — S8.5 target is ≤ 30 min idle for staff | #737 |
| V7.4 Session termination | sign-out deletes the session; blocking or deleting an account ends its sessions; sign-out visible in both shells | `E06-S19-member-shell`, `TEST-L02` | partial — unlinking Google ends no session; no action ends every session | #737 |
| V7.5 Session abuse defences | — | ENG-Q-12 | **gap** — no re-authentication before an e-mail change; users cannot list or end their sessions | #737 |
| V7.6 Federated re-authentication | Google sign-in issues an independent platform session | `foundation/api/identity/[provider]/start/route.ts` | partial — no limit on the Google authentication's age; `start` is a `GET` any page can trigger and `/api/auth/login` takes cross-site form posts | #744 |
| V8.1–V8.3 Authorization design and operation level | `requireFeatures` with feature ids, never role names; record scope from `people.scopeService`; tenant and organization derived on the server and fail-closed (S8.3) | `ISSUE-628-cross-club-isolation` (every route, every role, called directly), `TEST-F02-record-scope`, `TEST-F06-pesel` | partial — the cross-club part of A-2 is met by #628; still open: a route-by-route inventory of insufficient-feature and in-club scope tests, and a field-level access matrix | #743 |
| V8.4 Other authorization (cross-tenant) | one club never reads another club's data; a club B id answers like an unknown id (404, D-034); sessionless routes narrow after one system-scope lookup (D-024/D-026/D-027) | `ISSUE-628-cross-club-isolation`, kept complete by the `yarn verify` step `route-isolation:check` (inventory `packages/app/.ai/qa/tests/_fixtures/isolation/inventory/`) | met | — |
| V9.1–V9.2 Self-contained tokens | platform HS256 JWT with per-audience keys from `JWT_SECRET` (required at boot); Google id token checked for `aud`/`azp`/`exp` | `ENG-TEST-12-13-boot-env`, `TEST-S01-google-sign-in` | to verify — platform signature, algorithm and `exp` checks are code-read only; the Google id token's signature is not checked (V6.8) | #743 |
| V10 OAuth and OIDC | Vereino is an OIDC client of Google only: PKCE S256, single-use state bound to an `HttpOnly` cookie, server-side code exchange, scopes `openid email` | `TEST-S01-google-sign-in`, `foundation/lib/__tests__/identity.test.ts` | met for the client sections (V10.1, V10.2, V10.5); n/a for the authorization server, resource server and OpenID provider sections | — |
| V11.1 Cryptographic inventory | personal-link tokens: 32 random bytes, SHA-256 stored (S8.7, `foundation/lib/token-link.ts`); PESEL and external ids stored as lookup hashes; backups encrypted with `age` ([`backups.md`](../ops/backups.md)) | `foundation` unit tests | **gap** — no written key inventory or key-management policy (A-3); lookup hashes are keyed only when `LOOKUP_HASH_PEPPER` or the encryption fallback key is set, and the boot check requires neither | #740 |
| V11.2–V11.6 Implementation, algorithms, hashing, random, public key | Node `crypto` only, no hand-written cryptography (AGENTS.md); platform AES-256-GCM field encryption, bcrypt (cost 10) passwords, PBKDF2-SHA512 tenant key derivation | unit tests of `token-link.ts`; `TEST-F06-pesel` (ciphertext at rest) | to verify — platform primitives are code-read only | #743 |
| V11.7 In-use data cryptography | — | — | outside level 2 (level 3 only) | — |
| V12.1–V12.2 TLS, HTTPS to external services | TLS at Railway's edge (D-039); HSTS shipped (#463); Stripe, Resend, Google and the backup bucket over HTTPS | `ENG-TEST-11-security-headers` (HSTS) | partial — TLS versions, cipher suites, certificates and the HTTP-to-HTTPS redirect at the edge not measured | #739 |
| V12.3 Service to service | PostgreSQL and Redis on Railway's private network (WireGuard, D-039), reached through `*.railway.internal` | [`deploy.md`](../ops/deploy.md) | to verify — `deploy.md` names the private URL for Redis only; no public database proxy and the database TLS settings are confirmed by the lock-down checklist | #735 |
| V13.1–V13.2 Configuration documentation, backend configuration | `.env.example`; boot-time variable check that refuses to start (S8.10, #462, `packages/app/scripts/vereino-boot-env.mjs`); outbound services in [`processors.md`](processors.md) | `ENG-TEST-12-13-boot-env` | partial — runtime and migrations share one database role (least-privilege role decided in E3, not built); no egress allowlist; the boot check accepts the `.env.example` `JWT_SECRET` placeholder; Google sign-in not in `processors.md` | #735 |
| V13.3 Secret management | Railway sealed variables (D-039); restricted Stripe keys; GitHub secret scanning with push protection; `yarn verify` step `secrets:check` | [`github-settings.md`](../ops/github-settings.md), `scripts/check-secrets.mjs` | partial — sealed variables and the token inventory are applied by #735; tenant keys derive from one instance secret until a key store exists (#740) | #735 |
| V13.4 Unintended information leakage | `.dockerignore` keeps `.git` out of the image; `NODE_ENV=production`; dev-runtime routes answer 404 | `Dockerfile`, `.dockerignore` | partial — the OpenAPI document is served to anonymous callers without a recorded decision; TRACE and directory listings not checked | #743 |
| V14.1–V14.2 Data protection documentation and general | this compliance pack: [`ropa.md`](ropa.md) (categories, encrypted columns), [`retention.md`](retention.md) (jobs per period); minimisation S9.4; no analytics (S9.9) | retention jobs (`people:retention-sweep`, `people:life-cycle`, …) | partial — no protection levels per data class; tokens in link URLs by design (mitigated with `no-referrer`, `no-store`); Redis cache contents not reviewed; some retention periods still open | #743 |
| V14.3 Client-side data protection | `private, no-store` on authenticated API responses and token pages; session tokens only in `HttpOnly` cookies (S8.5) | `ENG-TEST-11-security-headers` | partial — no `Clear-Site-Data` on sign-out; the member context in `sessionStorage` outlives sign-out until the tab closes | #737 |
| V15.1–V15.2 Architecture and dependencies | Renovate with a 5-day cooldown, licence allowlist, pinned platform packages (S16); remediation times in S16.3; weekly audit (`.github/workflows/security.yml`) | `renovate.json`, `yarn verify` | partial — no SBOM; open Dependabot alerts not triaged; costly authenticated functions (imports, PDF, exports) not listed or rate-limited — sessionless routes are, see *Sessionless route inventory* (#738) | #741 |
| V15.3 Defensive coding | TypeScript strict; typed lint; Zod parsing of every body and query | `yarn typecheck`, `yarn lint` | partial — mass assignment, prototype and parameter pollution not tested; trusted proxy depth not yet measured and set for Railway (A-8); outbound fetches follow redirects | #743 |
| V15.4 Safe concurrency | `FOR UPDATE` sequences (S10.5), version checks and 409s, idempotent jobs (S15.8) | `TEST-085-concurrent-internal-bookings` | outside level 2 (level 3 only); the level 2 locking requirement is V2.3.4, met | — |
| V16.1–V16.2 Security logging, general logging | structured pino logs, no personal data in logs (S15.1); `no-console` in Vereino modules | [`monitoring.md`](../ops/monitoring.md), `vereino-ops-signal.test.mjs` | partial — no single logging inventory; user identity and clock source on log lines not confirmed | #735 |
| V16.3 Security events | platform audit log (`action_logs`); social sign-in failures logged with a fingerprint; anonymisation writes an audit row (S9.6) | — | partial — no list of security events; password sign-in and authorization failures are not logged to a kept sink | #743 |
| V16.4 Log protection | Railway logs readable by project members only; kept 30 days on Pro (D-039) | [`monitoring.md`](../ops/monitoring.md), [`incident.md`](../ops/incident.md) (export on incident) | partial — no log drain to a separate system; the workspace audit log needs a monthly export | #735 |
| V16.5 Error handling | error codes from `lib/error-codes.ts`, never stack traces or personal data (S6.7, S9.4); `reportError` with fingerprints (S15.2, needs `TELEMETRY_BACKEND=console`); scope fails closed | `ISSUE-628-cross-club-isolation` | partial — the production error body and outage paths of Stripe and Resend not checked | #743 |
| V17 WebRTC | — | — | n/a (not used) | — |

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

| Id | What | State | Owner |
|---|---|---|---|
| A-1 | Map every level 1 and 2 requirement of the applicable sections to a test or control | **closed** 2026-11-25: [`asvs-requirements.md`](asvs-requirements.md) (#742) | — |
| A-2 | Route-by-route inventory of the second-tenant and insufficient-feature tests (S13.4) | the second-tenant part is **closed** by the isolation guard (#628, `route-isolation:check`); the insufficient-feature and in-club scope inventory stays open | #743 |
| A-3 | Cryptographic key inventory with rotation (session secret, Stripe keys, backup key, token hashing, lookup-hash pepper) | open | #740 |
| A-4 | HSTS, `Permissions-Policy`, CSP without `'unsafe-eval'` (S8.4, phase E4) | **closed** 2026-11-23 by #463 (PR #530), proven by `ENG-TEST-11-security-headers` | — |
| A-5 | Owner decisions ENG-Q-09 (MFA) and ENG-Q-12 (session lifetime) | open | #736, #737 |
| A-6 | Owner decision ENG-Q-11 (cross-site request check) | open | #744 |
| A-7 | Default super-administrator from `yarn initialize` and the production password policy: runbook and policy written (#747, `docs/ops/deploy.md` → *First deploy*, *Default account check*, *Password policy*); the owner runs the default account check on staging and production and records the result in #747; the app-owned password check stays open | open | #747, #779 |
| A-8 | Measure the Railway proxy depth on staging, set `RATE_LIMIT_TRUST_PROXY_DEPTH` on staging and production, and record two clients with separate sign-in counters in a run log (`docs/ops/deploy.md` → *Rate limits*; #738); an edge proxy (#739) changes the depth | open | #739 |
