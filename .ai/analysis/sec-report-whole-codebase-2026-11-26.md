# Security report — whole codebase before the first real club data (internal review, #743)

Window: **whole codebase at `main` 1e45a949** (base: `main`), reviewed 2026-11-26 · Units analyzed: 7 (6 code areas, plus the ASVS rows owned by #743) · Excluded: 0 · Merged into other bases: 0 · Residue: 0

This is the internal part of E25-S09 (#743, owner decision of 2026-11-26). The repository is public, so this report follows the `withhold-live` disclosure policy: a live high or critical finding appears only as a placeholder, and its detail goes to the maintainers through a private GitHub security advisory (`SECURITY.md`). The external penetration test of staging is still to come and is tracked in #743.

## Executive summary

- **Total findings: 0 blocker (critical), 1 major (high), 22 minor (medium), 12 nit, 19 info; 1 withheld for private disclosure** (tracked in #806 and a private draft security advisory). Some findings were reported by more than one unit and are counted once per unit: the autologin and dev-secret switches the boot check does not refuse (U1-6, U6-3, U7-3); the platform `admin` role that club administrators receive (U2-2, U5-2); the CSP with `'unsafe-inline'` (U1-9, U6-2); the order-link page headers (U1-7, U2-6); the anonymous OpenAPI document (U6-7, U7-5).
- **Top OWASP categories:** A04 Insecure Design (6 medium), A05 Security Misconfiguration (5 medium), then A01, A07 and A09 (3 medium each). The one high finding is A08.
- **Cross-club isolation holds:** every unit traced its routes and found tenant and organization taken from the session, club B ids answering 404, and a complete isolation inventory (`route-isolation:check`). Every system-scope lookup the approved exceptions allow narrows to the club it found. No finding lets one club read or change another club's data through a request.
- **Deep vectors surfaced:** account lockout through per-address sign-in limits, refund race on concurrent refunds, link not revoked after a contact change, staff rights on threads that outlive the role, fail-open production switches at boot, reset links left valid after a reset, missing security-event logging.
- **Riskiest remaining area:** the platform `auth` module and the boot check. Sign-in lockout (U1-1), timing that reveals accounts on reset (U1-2), sibling reset links (U7-1), unlogged sign-in failures (U7-2) and unrefused autologin switches (U7-3) all sit in installed platform code that Vereino neither wraps nor tests.

## Open E25 findings — where they stand

| Story | State on 2026-11-26 | What this review adds |
|---|---|---|
| #735 S01 Railway lock-down | open; checklist written (PR #745) | U6-1 and U7-3: the boot check should refuse placeholder secrets and the autologin and dev-secret switches |
| #736 S02 second factor | open, in progress | U1-8: Google sign-in issues the session without the platform's second-factor hooks |
| #737 S03 session lifetime | open, in progress | no new finding |
| #738 S04 rate limits | closed (PR #751) | U1-1 lockout, U1-3 shared counter until the proxy depth is set, U1-4 and U2-4 per-user layer missing |
| #739 S05 edge proxy and WAF | open, in progress | V4.2.1 and V13.4.3 can be settled only at the edge |
| #740 S06 key store | open, in progress | U6-1: without an encryption key, encrypted columns are written in plaintext |
| #741 S07 GitHub hardening | open | U6-4: merge train merges without an approving review; U6-8 install scripts |
| #742 S08 ASVS checklist | closed (PR #748) | U7 gives a verdict for all 80 requirement rows owned by #743 (below) |
| #744 S10 cross-site request check | open, in progress | not re-analysed |
| #747 default super-admin, password policy | open; runbook merged (PR #781) | U6-3/U7-3 autologin switches |
| #779 app-owned password check | open | no new finding |

## For the external penetration test

What only a test of a running staging deployment can settle (U7): request smuggling at the Railway edge (V4.2.1), directory listings and `TRACE` (V13.4.3), whether access logs keep token paths (V14.2.1) and host clock sync (V16.2.2). The client-IP detection behind the proxy, on which every per-client limit rests, should be measured there too (A-8 of the ASVS checklist). Beyond those, the tester's scope in #743 (cross-club isolation, sign-in and sessions, public and token routes, uploads, payment webhooks, back office) matches the areas of units U1 to U5.

## Consolidated next steps — go deeper

Every per-unit next step, deduplicated; ordered by expected impact. Exactly one is **[recommended]**.

- **[recommended]** Fix the withheld major finding U5-1 (#806) through its private security advisory, then re-run `om-auto-sec-report-pr` on the fixing PR — the only high-severity finding of the review.
- `om-auto-sec-report-pr branch:main --deep-scan` scoped to the platform `auth` module (reset, login, autologin, profile password change) — U1-1, U1-2 and U7-1 to U7-3 sit in installed code that Vereino neither wraps nor tests.
- Audit `packages/app/scripts/vereino-boot-env.mjs` for fail-open production switches — encryption key and placeholders, `AUTH_SECRET`, `LOOKUP_HASH_PEPPER`, autologin and dev-secret switches in one rule set (U6-1, U6-3, U7-3).
- `om-auto-sec-report-pr branch:main --deep-scan` scoped to the installed `payment_gateways` staff routes and the `admin` role features the club administrator inherits (U2-2, U5-2) — money can move outside the Vereino ledger.
- Audit `packages/app/src/modules/payments/commands/checkout.ts` for concurrent refund reservations (U2-1).
- Audit `communication` thread visibility for grants that ended, and its reply flooding against the club send budget (U4-1, U4-2).
- Audit `packages/app/src/modules/foundation` for a security-event subscriber set (login failure, 429, 403, reset, role change) — closes V16.3.1 to V16.3.3 in one change (U7-2).
- Audit every Art. 9 health-data read path for `auditedRead` coverage against DPIA D-14 (U4-3), and the club export download for an audit entry and an expiry (U5-3).
- Audit `facilities` rental lifecycle for link revocation on every renter-identity change (U3-1), and `facilities/commands/requests.ts` for slot squatting through verified public requests.
- Audit `packages/app/src/app/api/[...slug]/route.ts` and `foundation` for a per-user layer under the club budget (U1-4, U2-4, U2-5).
- Audit `.github/workflows/ci.yml` and the live `main` ruleset for review-before-merge (U6-4, #741).
- Audit `packages/app/next.config.ts` for a nonce-based CSP and the PDF and image download routes that inherit the global CSP (U6-2).
- Audit `yarn verify` for an S5.8 raw-SQL interpolation gate and a `react/no-danger` lint rule — together they let five V1 and V3 rows be called met.
- Audit `packages/app/src/modules/foundation` e-mail templates for HTML escaping of club-entered text used by the `payments` templates.
- `om-auto-sec-report-pr branch:main --deep-scan` limited to `foundation` `authorizeScoped` and `scopeContract` grant resolution, the club_core public-site service, the people-module consumers of the foundation data export, and the season-rollover contributors in `activities` and `payments` — spot-checked only.
- Audit the Railway staging edge for request smuggling, `TRACE`, directory listings, clock sync and access-log retention of token paths — and re-run the sessionless families once `RATE_LIMIT_TRUST_PROXY_DEPTH` is set (U1-3).

## Risk heatmap

| OWASP category | Blocker | Major | Minor | Notes |
|---|---|---|---|---|
| A01 Broken Access Control | 0 | 0 | 3 | in-club only: platform admin grant (U2-2), link kept after a contact change (U3-1), thread rights after a role ends (U4-1); cross-club isolation held everywhere |
| A02 Cryptographic Failures | 0 | 0 | 1 | encryption key not required at boot (U6-1) |
| A03 Injection | 0 | 0 | 0 | parameterised SQL, React escaping, CSV formula prefixes; one nit on line breaks in mail subjects |
| A04 Insecure Design | 0 | 0 | 6 | rate-limit layering, refund race, Stripe test mode in production, reply flooding, slug release |
| A05 Security Misconfiguration | 0 | 0 | 5 | boot check gaps, CSP, platform `admin` role on club administrators |
| A06 Vulnerable and Outdated Components | 0 | 0 | 0 | audit not run here; the weekly `security.yml` job covers it |
| A07 Identification and Authentication Failures | 0 | 0 | 3 | lockout, reset timing, sibling reset links |
| A08 Software and Data Integrity Failures | 0 | 1 | 1 | one withheld; merge train without an approving review (U6-4) |
| A09 Security Logging and Monitoring Failures | 0 | 0 | 3 | health-data read, export download and sign-in failures not logged |
| A10 Server-Side Request Forgery | 0 | 0 | 0 | outbound URLs only from environment or fixed |
| Out of scope (not OWASP) | — | — | — | 0 findings |

Withheld findings count in their row; the notes never describe them.

## Deep vectors — coverage matrix

Abbreviated to vectors that surfaced a risk or stayed inconclusive; the full tables are in the per-unit fragments below.

| Vector | U1 | U2 | U3 | U4 | U5 | U6 | U7 |
|---|---|---|---|---|---|---|---|
| Cross-club IDOR | covered | covered | covered | covered | covered | not applicable | not applicable |
| Account lockout / enumeration | risk surfaced | not applicable | not applicable | not applicable | not applicable | not applicable | risk surfaced |
| Rate-limit layering | risk surfaced | risk surfaced | inconclusive (proxy depth) | risk surfaced | not applicable | not applicable | covered |
| TOCTOU on money | not applicable | risk surfaced | covered | not applicable | not applicable | not applicable | not applicable |
| Token revocation | covered | covered | risk surfaced | covered | covered | not applicable | risk surfaced |
| Over-broad or stale grants | not applicable | risk surfaced | covered | risk surfaced | risk surfaced | not applicable | not applicable |
| Fail-open configuration | risk surfaced | risk surfaced | not applicable | not applicable | covered | risk surfaced | risk surfaced |
| Security-event logging | not applicable | covered | covered | risk surfaced | risk surfaced | not applicable | risk surfaced |
| Withheld vector | — | — | — | — | risk surfaced | — | — |
| Request smuggling at the edge | not applicable | not applicable | not applicable | not applicable | not applicable | not applicable | inconclusive |

## Per-unit findings

## U1 — Sign-in, sessions and sessionless/public routes
<!-- sec-unit-status: complete -->
<!-- sec-unit-withheld: 0 - -->

- 10 findings: 0 blocker, 0 major, 4 minor, 3 nit, 3 info; 0 withheld.
- Top OWASP categories: A07, A04, A05. Deep vectors surfaced: targeted account lockout through the per-account limit, timing-based account enumeration on password reset, rate-limit identifier collapse behind the proxy, one member exhausting a club-wide budget, unbounded rate-limit bucket keys.
- Recommended next run: Audit `packages/app/src/app/api/auth/**` and `foundation/services/sessionless-limits.ts` for lockout and enumeration abuse — the per-account layers that close the brute-force gap also give anyone a cheap way to lock a known staff address out of both sign-in and reset.

The entry points held up well. Every `requireAuth: false` route is deliberate and rate-limited. Personal-link tokens are 256-bit, stored as HMAC hashes, compared in constant time, scope-narrowed, and single-use through a compare-and-set update. Social sign-in uses PKCE S256, a cookie-bound single-use state, and checks of `iss`, `aud`, `azp` and `exp`. It never matches by e-mail and never creates accounts. Every system-scope lookup checked (club slug, token hash, `(provider, subject)`) narrows each later query to the tenant and organization it found.

### U1-1 [Minor] A07 Identification and Authentication Failures — `packages/app/src/modules/foundation/services/sessionless-limits.ts:140`

- **What:** `withAccountEmailLimit` counts every sign-in attempt for an address before the platform handler, from any client, at 10 per 15 minutes (`SIGN_IN_EMAIL_LIMIT`). It also counts password-reset requests at 3 per hour (`PASSWORD_RESET_EMAIL_LIMIT`). Once the counter is spent, a correct password is refused too. The counter resets only after a successful sign-in, and none can succeed while it is spent.
- **Why:** Anyone who knows a staff address can keep that account locked out of password sign-in and password reset indefinitely, at about 13 requests per hour. This works against the treasurer and the club administrator. The window is time-bounded but renewable at will, and nothing alerts on it.
- **Fix:** Keep the per-account layer but stop it from blocking a correct password outright. For example, count only failed attempts (consume after a 401) and answer a spent counter with a step-up or a delay rather than a hard 429. Also log and alert on an address whose counter stays spent.
- **Apply elsewhere:**
  - `packages/app/src/app/api/auth/reset/route.ts:13` — same layer on password reset — together with the sign-in lockout it also removes the victim's recovery path.

### U1-2 [Minor] A07 Identification and Authentication Failures — `packages/app/src/app/api/auth/reset/route.ts:12`

- **What:** The Vereino wrapper passes the request straight to the platform reset handler. For a known address, that handler creates the token, renders the e-mail, awaits the e-mail transport and creates a notification before it answers. For an unknown address it answers at once. The body is the same `{ ok: true }` in both cases, but the response time differs by the provider round trip.
- **Why:** Response timing reveals whether an address has an account, so anyone can enumerate member and staff accounts. The sessionless link-request routes already avoid this with a floor and `after()`; this route does not.
- **Fix:** Give the wrapper a uniform minimum response time, or run the platform handler's send step after the response (as `activities/api/declaration-links/route.ts` does), so both branches answer in the same time.
- **Apply elsewhere:**
  - None found. The declaration and order link-request routes already pad, and the platform login equalizes bcrypt time.

### U1-3 [Minor] A05 Security Misconfiguration — `packages/app/scripts/vereino-boot-env.mjs:102`

- **What:** An unset or zero `RATE_LIMIT_TRUST_PROXY_DEPTH` behind the Railway proxy only produces a boot warning. In that state `getClientIp` returns null, and every per-client limit falls back to one shared key. This covers platform login, reset and session refresh, and every `metadata.rateLimit`.
- **Why:** One client can spend the shared budget, for example 20 sign-ins per minute, and block sign-in and every public route for all users. The deploy docs describe the risk, but nothing enforces the measured depth.
- **Fix:** Once the depth is measured per environment, make the Railway boot check refuse a missing or zero depth instead of warning (related: #739 edge WAF).
- **Apply elsewhere:**
  - `packages/app/src/modules/training/api/library-shared.ts:43` — the guest report's "once per client address" check falls back to the same shared key, so the first guest report of an entry blocks every later one.

### U1-4 [Minor] A04 Insecure Design — `packages/app/src/app/api/[...slug]/route.ts:455`

- **What:** The club request budget (DD-M10, 600 per minute) is keyed only by the session's tenant (`clubRequestLimitKey`). It has no per-user layer below it, so one authenticated member of any role, such as a guardian, spends the same counter as every staff user of the club.
- **Why:** A single low-privilege or compromised member account can keep its whole club at 429 on every authenticated API call. This is a cheap insider denial of service against the treasurer and the administrators.
- **Fix:** Add a per-user (`auth.sub`) layer with a smaller share of the club budget before the per-club layer, so no single session can spend it all.
- **Apply elsewhere:**
  - None found.

### U1-5 [Nit] A04 Insecure Design — `packages/app/src/modules/foundation/lib/club-limits.ts:44`

- **What:** `routeLimitKey` appends the raw `clubSlug` route parameter to the per-client key before the slug is validated or resolved.
- **Why:** A client that rotates made-up slugs gets a fresh bucket for every value. The per-client limit on the public route families then never trips, and every request still runs a slug lookup. With the memory strategy, the number of keys is also unbounded.
- **Fix:** Add the slug only when it passes `isPublicSlug`, or key it on the resolved club. Otherwise keep a per-client-only layer alongside the per-club one.
- **Apply elsewhere:**
  - None found.

### U1-6 [Nit] A05 Security Misconfiguration — `packages/app/scripts/vereino-boot-env.mjs:86`

- **What:** The Railway boot check refuses `OM_INTEGRATION_TEST` and `OM_TEST_MODE`, but not `OM_AUTOLOGIN_*` or `OM_ALLOW_DEV_AUTH_SECRET`. The deploy docs say never to set any of these in staging or production.
- **Why:** If an operator sets `OM_AUTOLOGIN_*` by mistake, the platform's autologin route signs every anonymous visitor in as the configured user. The dev auth-secret opt-in would let token hashing fall back to a published default.
- **Fix:** Refuse both on Railway in the same boot check.
- **Apply elsewhere:**
  - None found.

### U1-7 [Nit] A09 Security Logging and Monitoring Failures — `packages/app/next.config.ts:166`

- **What:** The declaration link and the facilities verify and cancel pages get `Referrer-Policy: no-referrer`. The order-link page `/club/o/{token}` and its API `/api/payments/order-links/{token}/**` do not. Both personal-link APIs also carry the raw token in the request path. The facilities routes deliberately moved the token into the body "so access logs never carry it".
- **Why:** Valid personal-link tokens end up in proxy and access logs and in same-origin referrers. Anyone with log access can act as the guardian until the link expires.
- **Fix:** Add the `no-referrer` headers for the order-link page and API. Consider sending the token in the body for the API calls, as the facilities routes do.
- **Apply elsewhere:**
  - `packages/app/src/modules/activities/api/declaration-links/[token]/route.ts:1` — the token is in the API path too (the referrer header is already set).

### U1-8 [Info] A07 Identification and Authentication Failures — `packages/app/src/modules/foundation/services/identity.ts:203`

- **What:** `issueSession` signs a Google-linked user in directly through `createSession` and `signJwt`, without the `auth/login` after-interceptors that the platform's login route runs. The platform's second-factor challenge plugs in through those interceptors.
- **Why:** No second factor is enabled today. Once one is added as a login interceptor, Google sign-in would bypass it for admins and treasurers.
- **Fix:** Tracked in #736. Include the social sign-in path in that work.
- **Apply elsewhere:**
  - None found.

### U1-9 [Info] A05 Security Misconfiguration — `packages/app/next.config.ts:29`

- **What:** The production CSP keeps `script-src 'unsafe-inline'` (the nonce-based CSP is deferred, documented) and `connect-src 'self' https:`.
- **Why:** Any HTML-injection bug becomes script execution, and `connect-src https:` lets injected script exfiltrate to any HTTPS host. The CSP gives no containment.
- **Fix:** Plan the nonce-based CSP, and narrow `connect-src` to the origins in use.
- **Apply elsewhere:**
  - None found.

### U1-10 [Info] A01 Broken Access Control — `packages/app/src/modules/club_core/lib/club-host.ts:138`

- **What:** On `<slug>.<club domain>`, `clubForHost` resolves the club even when its public pages are off. `/` then redirects to `/login` instead of not-found, and `signInTenantRedirect` puts the club's tenant id into the URL.
- **Why:** Anyone can confirm that an unpublished club exists and learn its tenant id. The id is not a credential, so the impact is reconnaissance only.
- **Fix:** Decide whether unpublished clubs should be discoverable through their host. If not, answer an unpublished host like an unknown one until sign-in.
- **Apply elsewhere:**
  - None found.

**Deep vectors — what was checked**

| Vector | Outcome | Location or note |
|---|---|---|
| Auth bypass on routes missing metadata | covered | dispatcher defaults `requireAuth` to true; every `requireAuth: false` route reviewed is intentional and rate-limited; `ratelimit_probe` and `example` are not in `src/modules.ts` |
| Dev-runtime and docs routes | covered | dev-runtime closed without the supervisor handshake; OpenAPI public (platform default), ACL metadata only for authorized callers |
| Token entropy / hash / constant-time / expiry / single use | covered | `foundation/services/token-link.ts`: 32-byte tokens, HMAC-SHA-256 hash, `timingSafeEqual`, CAS `UPDATE` on redeem, `peek` spends nothing |
| System-scope lookups narrow to the found tenant/org | covered | `clubFrame`, `inspect`/`peek` consumers (declaration, order, request verify, rental cancel), `findLinkForSignIn` → `signInUser` scoped |
| Public endpoints derive scope from slug/token, never a query tenant | covered | no public route reads `tenantId`/`organizationId` from input; sessionless contexts carry `auth: null` |
| User enumeration | risk surfaced | password reset timing (U1-2); sign-in, link requests and social outcomes are uniform |
| Open redirect after sign-in | covered | platform `sanitizeRedirectPath` + `buildSafeRedirectResponse` on login, autologin and social start/callback; host redirects use env origins |
| Session fixation / rotation | covered | new session and JWT on every sign-in, social included; MFA-pending swap clears `session_token` |
| JWT algorithm confusion | covered | HS256 fixed by the verifier, header `alg` ignored, `timingSafeEqual`, `exp` checked |
| Social sign-in account takeover (email trust, subject/provider confusion) | covered | no e-mail matching or account creation; unique (`provider`, `subject`); PKCE + cookie-bound single-use state; link requires the same session user and scope |
| OAuth id-token validation | covered | `iss`/`aud`/`azp`/`exp`/`sub` checked; signature not verified by design (V-S04, TLS back channel, https-only endpoints) |
| Rate-limit gaps on sessionless routes | risk surfaced | per-account lockout (U1-1), proxy depth collapse (U1-3), slug-rotated buckets (U1-5); limiter fails open on store outage (documented) |
| Lockout time-bounded and observable | risk surfaced | U1-1 |
| Per-tenant budget abuse | risk surfaced | U1-4 |
| CSRF on cookie-authenticated mutations | risk surfaced | tracked in #744 (e.g. identity unlink `DELETE`, link `POST`); GET state change limited to the OAuth callback, protected by state + PKCE |
| Second factor coverage | risk surfaced | U1-8, tracked in #736 |
| Cookie flags | covered | `HttpOnly`, `SameSite=Lax`, `Secure` in production, host-only (no `Domain`) so club subdomains do not share sessions |
| Headers / CSP / referrer | risk surfaced | U1-7, U1-9 |
| Public file downloads | covered | `readScoped` with expected owner/assignment/partition, `nosniff`, no SVG (magic-byte checked) |
| Boot-time fail-closed config | risk surfaced | U1-3, U1-6 |
| Cache-key scope (identity state) | covered | global-scope key on a 256-bit random state, 10-minute TTL, consumed once |

**Next steps — go deeper**

- **[recommended]** Audit `packages/app/src/app/api/auth/**` and `packages/app/src/modules/foundation/services/sessionless-limits.ts` for lockout and enumeration abuse — redesign the per-account layers so they stop brute force without letting anyone lock a known staff address out of sign-in and reset.
- Audit `packages/app/src/modules/facilities/commands/requests.ts` for slot squatting through verified public requests — `requested` rentals occupy slots, and anyone with several mailboxes can confirm requests (outside this unit's entry-point scope).
- Audit `packages/app/src/app/api/[...slug]/route.ts` for per-user versus per-club budget layering — one member exhausting the club budget.
- `om-auto-sec-report-pr branch:main --deep-scan` — rerun the sessionless families against the configured proxy depth once `RATE_LIMIT_TRUST_PROXY_DEPTH` is set on Railway, to confirm the per-client limits separate clients.

## U2 — Payments, money and payment webhooks
<!-- sec-unit-status: complete -->
<!-- sec-unit-withheld: 0 - -->

- 8 findings: 0 blocker, 0 major, 4 minor, 2 nit, 2 info; 0 withheld.
- Top OWASP categories: A04 Insecure Design, A01 Broken Access Control, A05 Security Misconfiguration. Deep vectors surfaced: TOCTOU on refunds, ledger bypass through installed staff routes, test-mode provider captures booked as real money, missing per-user limits on gateway sessions and reminders.
- Recommended next run: `om-auto-sec-report-pr branch:main --deep-scan` scoped to the installed `payment_gateways` staff routes and the role features the club administrator inherits. Those routes move money at the provider outside the Vereino ledger.

Webhook authenticity holds. The installed `payment_gateways` webhook route reads the raw body. It verifies the Stripe signature through the Stripe SDK, which uses a timing-safe compare and a 300-second tolerance, with the per-club webhook secret. It attributes the delivery to the club whose credentials verified it. Vereino never trusts the event body: `fulfilCheckout` re-reads the provider state under a row lock and books each checkout once. Every one of the 65 routes has an entry in `payments.json` or `payments-orders.json`. Every write uses `authorizeScoped` (club B id → 404) or a payer-, link- or job-scoped path. No role-name guards were found, and every write schema is `.strict()`.

### [Minor] U2-1 A04 Insecure Design — `packages/app/src/modules/payments/commands/checkout.ts:225`

- **What:** The online refund (`payments.payments.refund`) checks the refundable amount against refund entries that are already booked. The new entry is booked only after the provider call (phase 2). Between phase 1 committing and phase 2 booking, nothing marks a refund as pending. A second refund of the same payment, sent with a different `operationId` and the refreshed lock token, therefore passes the same check.
- **Why:** The provider caps refunds only at the whole gateway transaction. One transaction can back several payment rows: the charge lines of a multi-charge checkout and overpayment lines. So one payment can be refunded above its own amount, and the per-charge ledger goes negative. Exploit precondition: a holder of `payments.manage` with a treasurer or club-admin grant, racing their own requests. Both refunds are audited.
- **Fix:** In phase 1, inside the charge row lock, reserve the refund: a pending reversing entry, or a pending-refund sum on the payment. Count reservations in `refundable`, then confirm or release them after the provider answers.
- **Apply elsewhere:**
  - None found. Cash, bank and record-payment writes book under the charge row lock in one transaction.

### [Minor] U2-2 A01 Broken Access Control — `packages/app/src/modules/club_core/services/club-onboarding.ts:33`

- **What:** The club administrator holds the platform role `admin` (`CLUB_ADMIN_PLATFORM_ROLE`). The installed `payment_gateways` setup grants `admin` the features `payment_gateways.*` (`node_modules/@open-mercato/core/dist/modules/payment_gateways/setup.js:47`). That opens the staff routes `/api/payment_gateways/refund`, `/capture` and `/cancel` for the club's own transactions.
- **Why:** A refund or cancel through those routes moves money at Stripe. It writes no Vereino reversing entry and no `payments` audit entry, and it skips the refundable-amount rules. The charge then stays `paid` in the club ledger while the money is back with the payer. This is a ledger-integrity and audit gap, limited to the club administrator's own club.
- **Fix:** Remove `payment_gateways.refund|capture|manage` from the roles club users hold. Use a Vereino role-feature override or an ACL deny synced by `auth sync-role-acls`, or limit them to `payment_gateways.view`, so money moves only through `payments.payments.refund`.
- **Apply elsewhere:**
  - Other installed modules whose setup grants `<module>.*` to `admin` reach the club administrator the same way. This is worth one sweep in the identity unit.

### [Minor] U2-3 A04 Insecure Design — `packages/app/src/modules/payments/services/checkout.ts:330`

- **What:** The checkout fulfilment books any `captured` provider status as `online` payments. It does not check whether the club's Stripe connection is in test mode. `onlineConnectionOf` already tells `pk_test_` keys apart, but the settings tab only uses that to show a warning.
- **Why:** If a club leaves test keys connected in production, any payer can settle real charges with Stripe's public test cards. The charges are marked paid, and receipts and reports treat them as received money.
- **Fix:** Refuse `payments.checkout.create` in production while the connection is `connected_test`. Alternatively, store the provider's live/test mode with the payment and never settle a charge from a test-mode capture.
- **Apply elsewhere:**
  - None found.

### [Minor] U2-4 A04 Insecure Design — `packages/app/src/modules/payments/api/checkout/route.ts:14`

- **What:** `POST /api/payments/checkout` creates a new checkout and a new provider session (a Stripe PaymentIntent) on every call. Beyond the club-wide budget of 600 authenticated requests per minute, there is no per-user or per-payer limit. The only other cap is 50 charges per call.
- **Why:** One payer account can use up the club's whole request budget, which denies service to the club's staff and members. It can also create provider objects without bound on the club's Stripe account.
- **Fix:** Add a per-user limiter on checkout create and quote. Alternatively, reuse the payer's open `created` checkout for the same charge set instead of opening a new session.
- **Apply elsewhere:**
  - `packages/app/src/modules/payments/api/checkouts/[id]/refresh/route.ts` — each call reads the provider status; same per-user gap, lower cost.

### [Nit] U2-5 A04 Insecure Design — `packages/app/src/modules/payments/commands/group-charges.ts:315`

- **What:** Manual reminders use a fresh random idempotency key on every send and have no cooldown per payer or charge. This covers the coach's "Remind payers" (`payments.group_charges.remind`), "Remind guardians" and "Remind everyone" (`commands/order-campaigns.ts:536`). The nightly overdue reminder has a cooldown through `last_reminded_at`.
- **Why:** A coach account, or a script run by one, can e-mail the same payers repeatedly. Only the club e-mail pace and the request budget limit it, so the result is harassment and wasted club e-mail quota.
- **Fix:** Refuse or collapse a manual reminder to the same payer and charge within a cooldown window, for example by reusing a per-day idempotency key.
- **Apply elsewhere:**
  - `packages/app/src/modules/payments/commands/order-campaigns.ts:536` — same pattern.

### [Nit] U2-6 A05 Security Misconfiguration — `packages/app/next.config.ts:165`

- **What:** The personal order-link page `/club/o/:token` carries its raw token in the path. It does not get the `Referrer-Policy: no-referrer` and `Cache-Control: no-store` rule that `next.config.ts` gives the other token pages: declaration links and the facility request and cancellation pages. The API route sets `no-store` itself.
- **Why:** The global `strict-origin-when-cross-origin` still drops the path for cross-origin requests. The token can still reach same-origin request logs and intermediary caches of the HTML page.
- **Fix:** Add a `/club/o/:token*` rule with `no-referrer` and `no-store`, and a `no-referrer` rule for `/api/payments/order-links/:token*`.
- **Apply elsewhere:**
  - None found.

### [Info] U2-7 A01 Broken Access Control — `packages/app/src/modules/payments/api/checkouts/[id]/refresh/route.ts:31`

- **What:** The payer routes `checkout`, `checkout/quote` and `checkouts/[id]/refresh` answer 403 `checkout_charge_forbidden` for a club B id, not the 404 that D-034 asks for. The inventory records this with `expect: [403]`.
- **Why:** An unknown id gets the same 403, so the answer is no existence oracle. It does differ from the project-wide contract.
- **Fix:** Optionally answer 404 for ids not visible to the payer, to keep D-034 uniform.
- **Apply elsewhere:**
  - None found.

### [Info] U2-8 A05 Security Misconfiguration — `packages/app/src/modules/payments/di.ts:36`

- **What:** The integration-test gateway is registered whenever `OM_INTEGRATION_TEST=true`. Its webhook secret is fixed and public in the repository. The boot guard refuses that variable only on Railway (`scripts/vereino-boot-env.mjs:87`). Separately, the refund replay lookups at `commands/checkout.ts:223` and `:289` read by derived id or provider refund id without the scope filter.
- **Why:** A non-Railway production deployment with that variable set would accept forged captures. The unscoped lookups are not exploitable, because their keys derive from tenant-scoped input or the provider.
- **Fix:** Make the boot guard refuse `OM_INTEGRATION_TEST` whenever `NODE_ENV=production`, and add `tenantId`/`organizationId` to the two lookups.
- **Apply elsewhere:**
  - None found.

**Deep vectors — what was checked**

| Vector | Outcome | Location or note |
|---|---|---|
| Webhook signature, timing-safe compare, raw body | covered | installed `payment_gateways` webhook route + Stripe SDK `constructEvent`; per-club secret |
| Webhook replay / idempotency | covered | Stripe 300 s tolerance; fulfilment re-reads provider state, row lock + single booking |
| Webhook tenant attribution | covered | scope = the candidate transaction whose club credentials verified the signature; subscriber reads the checkout with that scope |
| Amount / currency tampering from the client | covered | totals from server-side shares and club fee settings; PLN fixed server-side; capture must equal the total |
| TOCTOU on cash, bank, record payment, handovers | covered | charge/payment row locks in id order; advisory locks for receipt and handover numbers |
| TOCTOU on refunds | risk surfaced | `packages/app/src/modules/payments/commands/checkout.ts:225` (U2-1) |
| Double charge on repeated checkout | covered | a second capture books an overpayment "to refund", flagged for the treasurer |
| Mass assignment | covered | every write schema `.strict()`; scope never taken from input |
| Cross-club IDOR (65 routes) | covered | `authorizeScoped` 404, `scopeWhere` lists; every route in the isolation inventory |
| ACL features / treasurer-only actions | covered | `payments.manage` + treasurer/club_admin grant on refunds, reversals, settings |
| Role-name guards | covered | none in `payments` |
| Installed staff routes bypassing the ledger | risk surfaced | `packages/app/src/modules/club_core/services/club-onboarding.ts:33` (U2-2) |
| Test-mode provider in production | risk surfaced | `packages/app/src/modules/payments/services/checkout.ts:330` (U2-3) |
| CSV / formula injection in exports | covered | `csvCell` and `csvField` neutralize `= + - @ tab CR` |
| Provider secrets storage / exposure | covered | credentials stay in `integrations`; settings answer only the connection mode |
| Public order links (token) | covered | hashed token, single DD-35 lookup, per-IP and per-token limits, constant-time 202 on link requests |
| Token in URL / referrer | risk surfaced | `packages/app/next.config.ts:165` (U2-6) |
| Rate limits on authenticated money routes | risk surfaced | `packages/app/src/modules/payments/api/checkout/route.ts:14` (U2-4) |
| Bank statement parsing (size, ReDoS) | covered | 2 MB / 2000 lines; linear regexes; integer grosz |
| Money in floating point | covered | integer grosz throughout; `Math.round` only at the gateway boundary |
| E-mail template injection | inconclusive (next step) | rendering owned by foundation `defineEmailTemplate`; checked in the communication/foundation unit |

**Next steps — go deeper**

- **[recommended]** `om-auto-sec-report-pr branch:main --deep-scan` scoped to the installed `payment_gateways` staff routes and the `admin` role features the club administrator inherits — U2-2 shows money can move outside the Vereino ledger.
- Audit `packages/app/src/modules/payments/commands/checkout.ts` for concurrent refund reservations — confirm U2-1 against the provider's per-transaction refund cap.
- Audit `packages/app/src/modules/foundation` for per-user limits on authenticated routes that create provider objects or send e-mail — U2-4 and U2-5 rely on one club-wide budget.
- Audit `packages/app/src/modules/foundation` e-mail templates for HTML escaping of club-entered text (campaign names, charge descriptions) used by the `payments` templates.

## U3 — Facilities, rentals and activities
<!-- sec-unit-status: complete -->
<!-- sec-unit-withheld: 0 - -->

- 9 findings: 0 blocker, 0 major, 1 minor, 2 nit, 6 info; 0 withheld.
- Top OWASP categories: A01, A04. Deep vectors surfaced: magic-link scope creep (a live cancellation link outlives a contact correction), the exact limits of the DD-R13 exception, upload buffering before the size check.
- Recommended next run: `om-auto-sec-report-pr branch:main --deep-scan` scoped to the foundation token-link service and `authorizeScoped`, which every route in this unit depends on.

### U3-1 [Minor] A01 Broken Access Control — `packages/app/src/modules/facilities/commands/rentals.ts:692`

- **What:** `facilities.rentals.update` lets staff correct `contactEmail` (and assign a registered renter), but it does not revoke or reissue the rental's single-use cancellation link (`facilities_rental_links`). Only `reissueCancelLink` in `services/rental-links.ts:74` deletes links, and it runs only for summary, approval and "moved" e-mails.
- **Why:** If a summary went to a mistyped or wrong address, whoever holds that mailbox can still cancel the rental through the sessionless link until the rental starts, even after staff fixed the address. A late cancellation forfeits the payment, and the freed slot can be taken.
- **Fix:** When `contactEmail` or the renter changes, delete the rental's `cancel` links in the same transaction (optionally sending a fresh terms e-mail to the corrected address).
- **Apply elsewhere:**
  - `packages/app/src/modules/facilities/services/rental-links.ts:68` — `reissueCancelLink` is the only revocation point; any future contact-changing command needs the same hook.

### U3-2 [Nit] A01 Broken Access Control — `packages/app/src/modules/activities/api/reports/coach-units/route.ts`

- **What:** The report GET exports (`reports/coach-units`, `reports/pzpn-attendance`, `reports/pzpn-schedule`) declare only `requireAuth` in route metadata. The feature gate lives only in the services (`services/coach-units.ts:103-111`, `services/pzpn-export.ts:68-73`).
- **Why:** The gate works today, but one service refactor could silently open an export path. The dispatcher-level guard and the OpenAPI document also do not show the required feature.
- **Fix:** Also declare the gate in route metadata (or document why it has to be an any-of check in the handler, as facilities `calendar` does).
- **Apply elsewhere:**
  - `packages/app/src/modules/activities/api/reports/pzpn-attendance/route.ts` — same pattern.
  - `packages/app/src/modules/activities/api/reports/pzpn-schedule/route.ts` — same pattern.

### U3-3 [Nit] A04 Insecure Design — `packages/app/src/modules/activities/api/club-event-uploads.ts:31`

- **What:** The club-event file upload buffers the whole file into memory before the per-kind size check. Memory is bounded only by the platform multipart limit.
- **Why:** A staff caller (`activities.manage`) can cause avoidable memory pressure per request. The impact is low because the route is authenticated and privileged.
- **Fix:** Check `file.size` against the per-kind limit before `arrayBuffer()`.
- **Apply elsewhere:**
  - `packages/app/src/modules/facilities/api/incidents/[id]/photos/route.ts:44` — same buffer-then-check order (5 MB limit, `facilities.log.write`).

### U3-4 [Info] A01 Broken Access Control — `packages/app/src/modules/facilities/commands/rentals.ts:426`

- **What:** The DD-R13 exception allows one read-only system-scope lookup by token hash. The cancellation flow does it 2-3 times: `rentalOfLink` → `peek`, then `redeem` (and a re-`find` after a lost race) in `foundation/services/token-link.ts:119`. The later lookups query by hash alone and compare tenant and organization in code afterwards. Verifying a request does the same (`facilities/commands/requests.ts:283-287`).
- **Why:** Nothing leaks: the hash is unique and the later lookups refuse a scope mismatch. This deviates only from the wording of the approved exception.
- **Fix:** Pass the found scope into the SQL `where` of the `find` that `redeem` runs (`lookup.scope`), or reword DD-R13 to cover peek + redeem.
- **Apply elsewhere:**
  - `packages/app/src/modules/facilities/commands/requests.ts:283` — same peek + redeem sequence.

### U3-5 [Info] A04 Insecure Design — `packages/app/src/modules/facilities/commands/incident-photos.ts:115`

- **What:** Incident photos are stored with their original bytes. EXIF metadata (GPS position, device) is not stripped.
- **Why:** Photos are private-partition and staff-only, so exposure is limited. Still, they are evidence that may hold location data beyond the policy's needs.
- **Fix:** Consider stripping metadata on upload, or record the decision to keep it.
- **Apply elsewhere:**
  - None found

### U3-6 [Info] A08 Software and Data Integrity Failures — `packages/app/src/modules/facilities/subscribers/payment-recorded.ts:31`

- **What:** The subscriber falls back to the payload's `tenantId`/`organizationId` when the event context has no scope.
- **Why:** Events are internal and the command re-checks that the charge is paid in that scope, so this cannot be exploited from outside. It is still a payload-scope fallback.
- **Fix:** Drop the payload fallback and skip the event when the emitter's scope is missing.
- **Apply elsewhere:**
  - None found

### U3-7 [Info] A01 Broken Access Control — `packages/app/src/modules/activities/services/public-session.ts:22`

- **What:** The public session route shows any session of a club that publishes its pages, by occurrence UUID.
- **Why:** This is by design (DD-17 capability URL): the query is narrowed to the club found by slug, the route is rate-limited and it returns no personal data.
- **Fix:** No change. Keep the UUID unguessable and the response free of personal data.
- **Apply elsewhere:**
  - None found

### U3-8 [Info] A01 Broken Access Control — `packages/app/src/modules/activities/commands/substitutions.ts:107`

- **What:** A 409 `occurrence_coach_conflict` lists the coach's other sessions (activity name, group id, place id), including ones outside the caller's grants.
- **Why:** The data stays within the club and is minimal, but it goes beyond the caller's scope.
- **Fix:** Redact labels for conflicts outside the caller's grants, as the facilities conflict views do.
- **Apply elsewhere:**
  - None found

### U3-9 [Info] A01 Broken Access Control — `packages/app/.ai/qa/tests/_fixtures/isolation/inventory/facilities.json`

- **What:** Every facilities and activities route and method has a cross-club probe in the isolation inventory. A crude scan flagged DELETE as missing for `/api/facilities/incidents`, `/logs` and `/maintenance-tasks`; this was confirmed as a false positive, because those routes export no DELETE handler.
- **Why:** This is a coverage confirmation, not a gap.
- **Fix:** None.
- **Apply elsewhere:**
  - None found

**Deep vectors — what was checked**

| Vector | Outcome | Location or note |
|---|---|---|
| Cross-club IDOR (ids in path/body) | covered | `authorizeScoped` loads in the trusted tenant and returns 404 for another club; lists use `scopeWhere`; foreign references (place, renter, section, person, incident) are validated in scope |
| Tenant/org from auth, never payload | covered | `trustedScopeOf`/`scopeContract`; strict schemas reject scope keys; one internal fallback noted (U3-6) |
| Rental link DD-R13 limits | risk surfaced | U3-4 (repeated hash lookup, scope compared afterwards); constant-time compare, single use, expiry at start, `no-referrer`, `no-store`, per-IP and per-token limits |
| Magic link scope creep | risk surfaced | U3-1 (link survives a contact correction) |
| Member vs staff (another family's child, booking) | covered | activities guardian/self grants via `authorizeScoped`; internal booking cancel is `self` (booker), coordinator or admin |
| ACL features on mutations | covered | every facilities mutation declares `requireFeatures`; activities report exports gate only in the service (U3-2) |
| Mass assignment | covered | `.strict()` write schemas in both modules |
| Booking race / capacity TOCTOU | covered | org-wide `pg_advisory_xact_lock` (`lockOccupancy`) in rental, request, booking, closure, maintenance and session writes; row locks plus re-read on cancel-by-link; photo count under the incident lock |
| File uploads (type, size, path, owner, download) | covered | magic-byte check, no SVG, sanitized stored name, private partition, `readScoped` with expected owner, assignment and partition, `nosniff`; buffering order U3-3; EXIF U3-5 |
| Calendar/ICS feeds | not applicable | no ICS feeds; the staff calendar is authenticated and place-scoped with contact redaction |
| CSV/formula injection in exports | covered | `csvField` neutralizes `= + - @ TAB CR`; activities PZPN export prefixes the same |
| XSS (names, descriptions, links) | covered | React escaping only, no `dangerouslySetInnerHTML`; public hrefs are https-validated or internal paths |
| Raw SQL / injection | covered | only parameterized advisory-lock statements |
| Public enumeration | covered | slug-based pages are public by design; one 404 shape for unknown places; public schedule shows states without names or ids (U3-7) |
| Rate limiting on public routes | covered | per-IP metadata limits; per-e-mail (fail closed) on requests; per-token on verify and cancel; IP derivation behind the proxy is tracked in #739 |
| Isolation inventory completeness | covered | U3-9 |

**Next steps — go deeper**

- **[recommended]** `om-auto-sec-report-pr branch:main --deep-scan` — focus on `foundation` `authorizeScoped`, `scopeContract` grant resolution (place descendants for `facility_operator`) and the token-link service. Every finding-free outcome in this unit rests on them.
- Audit `facilities` and `activities` sessionless routes for client-IP derivation behind the proxy — the per-IP limits are only as good as the trusted-proxy setup.
- Audit `facilities` rental lifecycle for link revocation on every renter-identity change (contact, renter assignment, move, approval) — this generalizes U3-1.

## U4 — People, children's data, groups and communication
<!-- sec-unit-status: complete -->
<!-- sec-unit-withheld: 0 - -->

- 8 findings: 0 blocker, 0 major, 3 minor, 2 nit, 3 info; 0 withheld.
- Top OWASP categories: A01, A04, A09. Deep vectors surfaced: stale staff rights after a role ends (messaging), reply flooding of staff mailboxes and of the per-club send budget, an unaudited health-data read path, unkeyed preview tokens.
- Recommended next run: Audit `communication` thread visibility for grants that ended. Staff rights come from stored participant reasons, and nothing checks them against current grants.

### U4-1 [Minor] A01 Broken Access Control — `packages/app/src/modules/communication/lib/thread-rules.ts:68`

- **What:** `isThreadStaff` (thread-rules.ts ~248) treats a viewer as thread staff whenever the stored participant row has the reason `author`, `coach` or `staff`. Participant rows are append-only, and visibility never re-checks a live grant. A coach removed from a group, or a coordinator whose section assignment ended, keeps staff visibility on that group's threads while their account stays active. They read every family's staff-only replies, including new ones, and `staffParticipants` keeps e-mailing them those replies.
- **Why:** Children's and family data in staff-only replies keeps reaching a person whose role has ended. This stays inside one club. It is a former insider risk, not a cross-club leak.
- **Fix:** Count `coach` and `staff` as staff reasons only while a matching live grant exists (`findActingRole` on the thread's scope). Otherwise treat the person as an ordinary participant and drop them from reply recipients.
- **Apply elsewhere:**
  - `packages/app/src/modules/communication/services/threads.ts` (`visibleHeader`) — the list header uses the same reasons, same risk.
  - `packages/app/src/modules/communication/commands/threads.ts` (`loadThreadAccess`) — reply and deliveries authorization use the same reasons, same risk.

### U4-2 [Minor] A04 Insecure Design — `packages/app/src/modules/communication/commands/threads.ts:435`

- **What:** `communication.threads.reply` has no per-author rate or count limit. Direct threads have one (`countDirectThreadsSince`, threads.ts:322). Any member account can post replies of up to the body limit without bound, and each reply e-mails every staff participant. On a club announcement, every staff participant means the author plus every coach of the club.
- **Why:** This allows mailbox flooding of staff. It also uses up the per-club send rate, which delays real announcements and session-cancellation notices for the whole club (availability of safety-relevant messages).
- **Fix:** Add a per-person reply limit under the same advisory-lock pattern as direct threads. Also consider sending reply notifications to staff as a digest per thread.
- **Apply elsewhere:**
  - `packages/app/src/modules/communication/commands/threads.ts` (revise path, ~525) — edits of a reply have no limit either, so this is the same pattern.

### U4-3 [Minor] A09 Security Logging and Monitoring Failures — `packages/app/src/modules/people/services/medical.ts:212`

- **What:** `staffMedicalBlock` returns a person's medical certificate date and status to a coordinator in `GET /api/people/persons/{id}`. Unlike `GET /api/people/medical-status`, this read is not recorded through `auditedRead`. The medical-status route records coordinator and coach reads, ids only, as the DPIA D-14 measure.
- **Why:** The same Art. 9 health data reaches staff through two paths. Only one of them leaves a trace, so after an account takeover the detail page reads health data without a record.
- **Fix:** Wrap the coordinator branch of `staffMedicalBlock` in `auditedRead` with purpose `medical_status_read`. The administrator branch can stay unlogged, as it is on the medical-status route.
- **Apply elsewhere:**
  - None found.

### U4-4 [Nit] A03 Injection — `packages/app/src/modules/communication/data/validators.ts:9`

- **What:** The thread subject is only trimmed at its ends, so it may contain CR/LF. Members set it on direct threads, and it is copied into the reply e-mails' Subject header. The same applies to person names (`nameSchema`, `people/data/validators.ts:11`), which go into the Subject of the turns-18 notice (`people/emails/templates.ts:204`).
- **Why:** The only enabled transport is `channel_resend`, a JSON API that does not take raw headers, so nothing can be injected today. A future SMTP transport (`channel_imap` is installed but not enabled) could make it reachable.
- **Fix:** Reject or collapse `[\r\n\t]` in subjects and names at the zod layer, as `excerpt` already does.
- **Apply elsewhere:**
  - `packages/app/src/modules/people/data/validators.ts:11` — same pattern, unreachable with the current transport.

### U4-5 [Nit] A08 Software and Data Integrity Failures — `packages/app/src/modules/groups/lib/rollover-token.ts:33`

- **What:** The preview tokens of the season rollover, the bulk move and the departure (`people/lib/departure-token.ts:34`) are unkeyed SHA-256 hashes of values the caller knows, with an expiry the caller chooses, compared with `===`. A holder of the feature can build a valid token without running the preview.
- **Why:** This bypasses only the "preview before apply" safety step and the 15-minute window. Every apply re-checks the scope and recomputes the plan, and the departure token is documented as "not a secret".
- **Fix:** Use an HMAC with a server secret and `timingSafeEqual`, or record in the specs that the token detects stale plans only.
- **Apply elsewhere:**
  - `packages/app/src/modules/people/lib/departure-token.ts:34` — same pattern, documented as not a secret.

### U4-6 [Info] A01 Broken Access Control — `packages/app/src/modules/groups/commands/memberships.ts:247`

- **What:** A section coordinator can add any live person of the club as `coach` or `assistant` of a group in their section. The role sync then gives that person `vereino_coach`, which holds `people.medical.view`, `communication.post` and `payments.groups.collect` for that group.
- **Why:** A section-level role delegates a role that reads health status and collects cash, and no higher role approves it. This looks intended but is not written down as a decision.
- **Fix:** Have the owner confirm it and record the decision in the groups spec. Otherwise, require `people.roles.manage` for the staff membership roles.
- **Apply elsewhere:**
  - None found.

### U4-7 [Info] A04 Insecure Design — `packages/app/src/modules/people/services/departure.ts:16`

- **What:** `communication` is not a departure contributor, so anonymising or deleting a person keeps their own message bodies, revisions and participant rows. Only the displayed name becomes "Former member".
- **Why:** Messages are kept by decision Q-L21 of the life-cycle spec, which covers bodies that others wrote. Free-text replies a family wrote about a child (often health details) stay, encrypted, after the family asks for erasure.
- **Fix:** Ask the owner whether the person's own replies should become tombstones on anonymisation. If yes, add a `people.departure.communication` contributor that keeps ids and counts.
- **Apply elsewhere:**
  - None found.

### U4-8 [Info] A01 Broken Access Control — `packages/app/src/modules/groups/api/external-teams/route.ts:56`

- **What:** The decrypted `contact` and `notes` of external (opponent) teams are readable club-wide by every coach. The dictionary read is club-wide by design.
- **Why:** These are third-party personal data, and this is the widest audience for decrypted contact data in the unit.
- **Fix:** Consider hiding `contact` from the coach role, or record the audience as an accepted product decision.
- **Apply elsewhere:**
  - None found.

**Deep vectors — what was checked**

| Vector | Outcome | Location or note |
|---|---|---|
| Cross-club IDOR, every route and method of `people`, `groups` and `communication` | covered | Each route derives scope with `trustedScopeOf`/makeCrudRoute and checks it with `authorizeScoped`/`assertInScope`/`scopeWhere`. The isolation inventories `people.json`, `groups.json` and `communication.json` cover every exported route and method (checked against the route exports). |
| A parent or member reading or editing another family's or child's record | covered | Person, guardianship and consent writes go through grant kinds (`self`, `guardian`, `club_admin`). `me/*` routes load the caller's own person. Departure requests check `self` or `guardian` per subject. Self-update and import schemas are `.strict()`. |
| Coach and coordinator scope enforced on the server | covered | Groups writes need coordinator or admin, with the target group re-checked on move, move-many and rollover. The coordinator writes the medical date only for members of their own sections (`inSections`). Medical status drops out-of-scope ids. |
| Stale grants in messaging | risk surfaced | U4-1 |
| Medical/sensitive fields in lists, search, enrichers and exports | covered | The person list leaves out e-mail, phone, notes and PESEL. Search is indexed through hashed tokens only, and the presenter returns the name only. Enrichers add group names or counts only. The CRUD export is disabled. The data export is admin-only, scope-checked and logged before reading. |
| Audit of health-data reads | risk surfaced | U4-3 |
| Departure and erasure completeness (`people.departure.*`) | risk surfaced (info) | U4-7. Contributors are registered for `groups`, `activities`, `payments`, `club_core`, `facilities` and `training`. |
| Declarations and consents via sessionless links | not applicable | There is no sessionless route in this unit. The public group catalogue gets its scope from the `club_core` slug lookup (D-024, outside this unit) and shows instructor names only with consent. |
| Mass-mail abuse | risk surfaced | U4-2. Audiences are capped at 2000 recipients, and direct threads at 20 per 24 h. |
| E-mail header injection | risk surfaced (nit) | U4-4. Not reachable with the Resend transport. |
| HTML injection in e-mail templates and XSS in pages | covered | Templates are React elements with escaped text. There is no `dangerouslySetInnerHTML` or markdown in the three modules, and links are built from ids. |
| Attachments (photo download authorization and owner assignment) | covered | `readScoped` checks the exact owner, assignment and private partition. A coordinator's basic read gets 403. The upload checks format and size by magic bytes. Non-admin roles hold no `attachments.*` feature. |
| Upload parsing (family import CSV/XLSX) | covered | The format is detected from the bytes. Zip-bomb and entry budgets apply, DOCTYPE is refused, and entities are not expanded. Row, column and cell limits apply. |
| Privilege escalation through role sync and events | covered (info U4-6) | Subscribers prefer the emitter's scope over the payload's and recompute roles from stored records. |
| Preview-token integrity | risk surfaced (nit) | U4-5 |
| PII in logs and audit payloads | covered | Loggers carry scope and error only. Messaging audit rows hold ids only, and event payloads are ids plus scope. |
| Pagination caps | covered | CRUD lists are capped at 100. `member-groups` is bounded per family. |
| Account e-mail change and takeover | covered (tracked) | Admin-only (`people.accounts.manage`) inside the club's tenant and organization. Step-up before an e-mail change is tracked in #737. |

**Next steps — go deeper**

- **[recommended]** Audit `communication` thread visibility for grants that ended (U4-1): compare stored participant reasons with live grants on read, reply and deliveries.
- Audit `communication` and the per-club send limiter for flooding: replies, revisions and how notification e-mails interact with the club send budget (U4-2).
- Audit every Art. 9 health-data read path (`people`, `activities` rosters, attendance) for `auditedRead` coverage against DPIA D-14 (U4-3).
- `om-auto-sec-report-pr branch:main --deep-scan` — limited to the season-rollover contributors in `activities` and `payments`, whose record filtering was checked only in passing from `groups`.

## U5 — Club core, foundation, training library and back office
<!-- sec-unit-status: complete -->
<!-- sec-unit-withheld: 1 .ai/tmp/om-auto-sec-report-pr/withheld/u5-club-core-foundation-training-2026-11-26.md -->

- 5 findings: 0 blocker, 1 major, 3 minor, 0 nit, 1 info; 1 withheld.
- Top OWASP categories: A08, A05, A09, A04. Deep vectors surfaced: one withheld vector, over-broad platform grant to the club administrator, unaudited bulk export download, slug release without reservation, shared-cache lag after a library withdrawal.
- Recommended next run: fix and re-review the withheld major finding U5-1 through its private security advisory — it is the only high-severity finding of the whole review.

### U5-1 [Major] A08 Software and Data Integrity Failures — withheld

Details withheld for private disclosure: this weakness is live on the base branch. No location is published until it is fixed.

### U5-2 [Minor] A05 Security Misconfiguration — `packages/app/src/modules/club_core/services/club-onboarding.ts:33`

- **What:** `club_core create-club` gives every club administrator the platform `admin` role (`CLUB_ADMIN_PLATFORM_ROLE`, used at `:322`) next to `vereino_club_admin`. That role carries the platform's instance-level features (`configs.system_status.view`, `configs.manage`, `configs.cache.manage`, `scheduler.*`, `query_index.*`, `entities.*`, `api_keys.*`, `integrations.*`). On a shared instance it lets the administrator of one club read the instance environment snapshot, including the database host, port and name (credentials masked), and the instance-wide module telemetry. It also lets them mint long-lived API keys and manage schedules and index jobs outside the Vereino role catalogue.
- **Why:** Each club administrator learns infrastructure details, and gets capabilities that the catalogue in `packages/core/src/roles.ts` does not list and that no Vereino review covers. This widens the blast radius of any one compromised club administrator account. The cache, ACL and scheduler routes stay tenant-scoped (checked), so no cross-club write was found.
- **Fix:** Give the club administrator a Vereino-owned platform role with an explicit feature list (no `configs.system_status.view`, `configs.manage`, `api_keys.*` or `scheduler.jobs.manage` unless a story needs them). Keep the platform `admin` role for the instance maintainers only, and resync existing clubs with `auth sync-role-acls`.
- **Apply elsewhere:**
  - `packages/app/node_modules/@open-mercato/core/src/modules/configs/setup.ts:6` — same pattern, same risk — the platform default that puts `configs.system_status.view` on `admin` (read-only, listed for the role trim).

### U5-3 [Minor] A09 Security Logging and Monitoring Failures — `packages/app/src/modules/club_core/api/offboarding/export/route.ts:40`

- **What:** `GET /api/club_core/offboarding/export` streams the club's whole data archive, with every member's decrypted personal data, to any holder of `club_core.manage`. It writes no audit or access-log entry (unlike the guardian-contact reads, which use the foundation `auditedRead` helper). The archive also stays in the private partition after the operator withdraws the notice: `readClubExportArchive` (`packages/app/src/modules/club_core/services/club-export.ts:214`) does not check the offboarding state, so a later administrator can still download it.
- **Why:** The largest bulk exfiltration path of a club leaves no trace of who downloaded it or when, and a personal-data copy outlives its purpose (data minimisation) when a club decides to stay.
- **Fix:** Record each download (actor, club, job id, size) through the foundation audited-read helper or the access log before streaming. Refuse the download, and delete the stored archives, once the notice is withdrawn or after a fixed retention period.
- **Apply elsewhere:**
  - `packages/app/src/modules/club_core/lib/club-export.ts:114` — same pattern, same risk — `clubExportDownload` serves the newest completed archive with no age or state limit.

### U5-4 [Minor] A04 Insecure Design — `packages/app/src/modules/club_core/commands/settings.ts:287`

- **What:** A club administrator can rename or clear the club's public slug (`PUT /api/club_core/settings`, `nullableSlug` at `packages/app/src/modules/club_core/data/validators.ts:54`). The old slug is freed at once: only the fixed reserved labels are refused, and the 90-day reservation (BR-M4) applies only to deleted clubs. Any other club administrator can claim it straight away.
- **Why:** The slug is the club's subdomain. Members' bookmarks, printed QR codes and old e-mails then reach a different club's public pages, and the sign-in form on that host targets the other club's tenant. That is a phishing and confusion surface, not a credential leak, because sign-in stays on the same instance.
- **Fix:** Keep a released slug reserved for the same 90 days as a deleted club's slug (a tombstone row or a slug-history table), and answer `slug_reserved` to every other club during that time.
- **Apply elsewhere:**
  - None found

### U5-5 [Info] A04 Insecure Design — `packages/app/src/modules/training/api/library-shared.ts:36`

- **What:** Public library entries are served with `Cache-Control: public, s-maxage=60` (`packages/app/src/modules/training/api/public/library/[entryId]/route.ts:24`), and their images with `public, max-age=300, s-maxage=300`.
- **Why:** After a withdrawal, a lowered club level or the removal of an author's name, shared caches and browsers can keep serving the old entry (and the author's name) for up to 5 minutes.
- **Fix:** Accept the delay and document it in the privacy notice, or send `no-cache` with an ETag on public library responses so a withdrawal takes effect at once.
- **Apply elsewhere:**
  - `packages/app/src/modules/club_core/api/public-shared.ts:19` — same pattern, lower risk — public club pages use `public, s-maxage=60`; an unpublished page lingers up to 60 s.

**Deep vectors — what was checked**

| Vector | Outcome | Location or note |
|---|---|---|
| Operator commands reachable from a request | covered | the offboarding, export and provision commands accept only a `system_job` grant; `jobScope` refuses any context with a session, so an audit-log redo cannot replay them; the CLI-only services have no route importer |
| Withheld vector (U5-1) | risk surfaced | withheld |
| Club export completeness / secrets in export | covered | `password_hash` and delivery `secret_params` are nulled; sessions, password resets, API keys and provider credentials are not exported |
| Who can download the club export | risk surfaced | `club_core.manage` only (club_admin); no download audit, no retention limit (U5-3) |
| Tenant creation and club-admin bootstrap | risk surfaced | invitation by a single-use 48 h reset token, no password on the CLI; platform `admin` role over-broad (U5-2) |
| Wildcard grants / role-name guards | covered | `club_core.*` and `training.*` only on `vereino_club_admin`; guards check features, role names are used only for assignment |
| DD-M07 job claim and dispatch sweeps | covered | the claim reads ids and scope only; every per-club run runs under the club's lease or `verifyScheduledJobScope`; the system sweep narrows each club to its own scope |
| Scheduler as a privilege bridge | covered | no Vereino command or worker is scheduler-safe; the schedule scope comes from the registration row |
| Training library cross-tenant service | covered | config-only library scope; visibility filter on every read; rater and reporter keys are HMACs; guest reports do not count towards hiding; the author name is stripped on consent withdrawal (cache lag: U5-5) |
| Settings that change security behaviour | risk surfaced | slug release (U5-4); URLs restricted to https, accent colour normalised to hex, minimum age bounded 13–18 |
| Back-office pages and API ACL features | covered | every club_core, training and foundation route and page declares `requireAuth` plus features; the identity unlink checks the owner, then self or manage |
| Isolation inventory coverage | covered | all 50 routes of club_core, foundation and training have probes or a justified exemption |
| `example*` modules in production | not applicable | not in `src/modules.ts` and not imported by any enabled module, so their routes are not registered |
| Social sign-in (OAuth) | covered | PKCE S256, single-use state bound to an HttpOnly cookie with a timing-safe compare, session match on link, back-channel id token with iss, aud and exp checked, sanitized redirect |
| Token links (magic links) | covered | stored hashed, timing-safe match, single use, expiry capped |
| Injection (raw SQL) | covered | dynamic identifiers come from the server catalogue and are quoted and pattern-checked; every value is a bound parameter |
| Upload content type and XSS sinks | covered | magic-byte checks, no SVG, `nosniff`; no `dangerouslySetInnerHTML` in scope |
| Rate limiting on public routes | covered | public club and library pages 120/min, library guest report 5/h, identity start and callback 20/min |
| CSRF on cookie-authenticated mutations | not applicable | tracked in #744 |

**Next steps — go deeper**

- **[recommended]** Fix the withheld major finding U5-1 through its private security advisory, then re-run `om-auto-sec-report-pr` on the fixing PR.
- Audit `the platform admin role grant to club administrators` for least privilege — list each `admin` feature against a Vereino story and trim the rest (U5-2).
- Audit `club_core offboarding export` for audit logging and retention — download audit and archive expiry (U5-3).
- `om-auto-sec-report-pr branch:main --deep-scan` — the club_core public-site service and the people-module consumers of foundation `data-export` were only spot-checked.

## U6 — Platform configuration, deployment and supply chain
<!-- sec-unit-status: complete -->
<!-- sec-unit-withheld: 0 - -->

- 9 findings: 0 blocker, 0 major, 4 minor, 2 nit, 3 info; 0 withheld.
- Top OWASP categories: A05 Security Misconfiguration, A02 Cryptographic Failures, A08 Software and Data Integrity Failures. Deep vectors surfaced: fail-open encryption at rest on a missing key, placeholder secrets accepted at boot, CSP that does not contain an XSS, unreviewed auto-merge path, install-time scripts and mutable lockfile in image builds.
- Recommended next run: Audit `packages/app/scripts/vereino-boot-env.mjs` for every security switch the production profile leaves open — one boot-time rule set closes U6-1 and U6-3 together.

### U6-1 [Minor] A02 Cryptographic Failures — `packages/app/scripts/vereino-boot-env.mjs:29`

- **What:** the production boot check requires `JWT_SECRET` but neither requires `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (or Vault) nor refuses the value published in `packages/app/.env.example:555` and the `docker-compose.fullapp.yml` defaults, and the platform KMS (`@open-mercato/shared` `createKmsService`) falls back to a no-op KMS without a key, so `encryptEntityPayload` returns the payload unchanged and encrypted columns (PESEL, personal data) are written in plaintext with only a log warning.
- **Why:** one missing or copied variable silently turns off encryption at rest for every club, or keys it with a secret anyone can read in this public repository, so a database or backup read exposes the personal data the encryption maps are meant to protect.
- **Fix:** add production rows to `REQUIRED_VARIABLES` that require the encryption key (or a Vault address and token) when `TENANT_DATA_ENCRYPTION` is on, refuse the published example values, refuse `TENANT_DATA_ENCRYPTION` off on Railway, and require `LOOKUP_HASH_PEPPER`; the key inventory itself is tracked in #740.
- **Apply elsewhere:**
  - `packages/app/.env.example:25` — `AUTH_SECRET` example value — the platform's placeholder policy covers `JWT_*` only, yet `AUTH_SECRET` is preferred for session/reset token hashing (`auth/lib/tokenHash.ts`) and consent integrity (`auth/lib/consentIntegrity.ts`); refuse it at boot as well.
  - `LOOKUP_HASH_PEPPER` — unset falls back to the encryption key or an unkeyed digest (ASVS V11.1 row), so lookup hashes of PESEL inherit the same gap.

### U6-2 [Minor] A05 Security Misconfiguration — `packages/app/next.config.ts:38`

- **What:** the production CSP keeps `script-src 'unsafe-inline'` and allows `connect-src 'self' https: ws: wss:` and `img-src https:`, so it blocks neither an injected inline script nor its exfiltration to any HTTPS host.
- **Why:** the CSP is the only browser-side backstop for an XSS in any module (club public pages render staff-entered content to anonymous visitors), and as configured it does not limit the impact of one.
- **Fix:** move to a nonce-based `script-src` (the deferral is recorded in the config comment and ASVS V3.4, assigned to #743) and narrow `connect-src`/`img-src` to `'self'` plus the named Stripe and storage origins.
- **Apply elsewhere:**
  - `packages/app/next.config.ts:154` — the attachment-file CSP override has `sandbox` but no `frame-ancestors` (ASVS V3.4 row).

### U6-3 [Minor] A05 Security Misconfiguration — `packages/app/scripts/vereino-boot-env.mjs:61`

- **What:** the boot rules refuse `OM_TEST_MODE`, `OM_INTEGRATION_TEST` and a disabled rate limiter on Railway, but not `OM_AUTOLOGIN_EMAIL`/`OM_AUTOLOGIN_PASSWORD` or `OM_ALLOW_DEV_AUTH_SECRET`, which `docs/ops/deploy.md` says must never be set in production; the platform autologin route has no production guard of its own, and `src/app/page.tsx` sends every visitor without a session to it when the variables are set.
- **Why:** one leftover demo variable makes every anonymous visitor the configured account (typically the super-admin), and nothing at boot catches it.
- **Fix:** add `RATE_LIMIT_RULES`-style rules that refuse `OM_AUTOLOGIN_*` and `OM_ALLOW_DEV_AUTH_SECRET` whenever `NODE_ENV=production`, not only on Railway.
- **Apply elsewhere:**
  - `DEMO_MODE`, `SELF_SERVICE_ONBOARDING_ENABLED` — set off in the Dockerfile and `deploy.md` only, not checked at boot; same rule.

### U6-4 [Minor] A08 Software and Data Integrity Failures — `scripts/merge-train.mjs:144`

- **What:** the merge train squash-merges, with the owner's `MERGE_TRAIN_TOKEN`, any open non-draft same-repository PR whose required checks are green and that carries no skip label, without checking for an approving review; the `main` ruleset holds only the status-check rule (no pull-request requirement, no force-push block, per `docs/ops/github-settings.md`), and the `gate` job runs `yarn guard` from the PR's own checkout, so a branch can change the guard it is judged by.
- **Why:** anyone with write access (a collaborator or an automation token) can land code on `main`, and so in the next Railway deploy, without a human review; forks are excluded (`pull.head.repo` check at line 149), so this is not reachable by an outside contributor.
- **Fix:** tracked in #741 (GitHub hardening): add the pull-request rule and force-push block to the ruleset, and run the guard from the base branch's copy of `scripts/guard.mjs` (as the train and the ledger already do with `main`'s scripts) or have the train require an approval or the `guard-approved` state for PRs that touch `scripts/guard.mjs`.
- **Apply elsewhere:**
  - None found

### U6-5 [Nit] A08 Software and Data Integrity Failures — `Dockerfile:35`

- **What:** the image builds run `yarn install` (lines 35 and 71) and `yarn workspaces focus --production` (line 128) without `--immutable` or `YARN_ENABLE_IMMUTABLE_INSTALLS`, and Railway's Docker build does not set `CI`, so a lockfile out of sync with a manifest is re-resolved at deploy time instead of failing.
- **Why:** the deployed image could contain dependency versions the CI gate (`yarn install --immutable`) never tested; low likelihood because `main` only changes through a green gate.
- **Fix:** set `ENV YARN_ENABLE_IMMUTABLE_INSTALLS=true` in each stage before the install.
- **Apply elsewhere:**
  - `docker/scripts/dev-entrypoint.sh` — dev only; same pattern, no action needed.

### U6-6 [Nit] A05 Security Misconfiguration — `.dockerignore:14`

- **What:** `.env`, `.env.local` and `.env.*.local` are root-anchored patterns, but the app's environment file lives in `packages/app/`, so a build from a developer checkout copies `packages/app/.env*` into the `builder` stage and the `dev` image (`COPY . .`), and `next build` inlines its `NEXT_PUBLIC_*` values (for example `NEXT_PUBLIC_UMES_DEVTOOLS=true` from the example) into the client bundle of the runner image.
- **Why:** a locally built or pushed image can carry a developer's secrets and dev-only client switches; Railway builds from git, where no `.env` exists, so production is not affected today.
- **Fix:** use `**/.env` and `**/.env.*` with `!**/.env.example`.
- **Apply elsewhere:**
  - None found

### U6-7 [Info] A05 Security Misconfiguration — `packages/app/src/app/api/docs/openapi/route.ts:12`

- **What:** the enabled `api_docs` module serves the full OpenAPI document (and its markdown form) to anonymous callers.
- **Why:** it maps every route and schema for an attacker; the repository is public, so the added exposure is small, but the ASVS V13.4 row records it as an open decision.
- **Fix:** decide it under #743 (ASVS V13.4): require a staff session in production or accept and record it.
- **Apply elsewhere:**
  - `packages/app/src/app/api/docs/markdown/route.ts` — same document.

### U6-8 [Info] A06 Vulnerable and Outdated Components — `.yarnrc.yml:13`

- **What:** dependency lifecycle scripts run on every install (Yarn's `enableScripts` default) in CI and in the image build, and `npmPreapprovedPackages` exempts `@open-mercato/*` from the 5-day age gate.
- **Why:** a compromised transitive package executes during `yarn install` with the CI runner's or the image builder's environment; the platform scope can arrive the same day it is published (only on a deliberate upgrade, since Renovate leaves it alone).
- **Fix:** set `enableScripts: false` and allow the packages that need a build step through `dependenciesMeta`, and review platform upgrades against the release diff (#741 covers Dependabot/CodeQL).
- **Apply elsewhere:**
  - None found

### U6-9 [Info] A05 Security Misconfiguration — `Dockerfile:148`

- **What:** the runner image ships the whole `scripts/` tree (merge train, harness, backup tooling) and `packages/app/scripts` beside the app, and `next.config.ts` leaves `poweredByHeader` on.
- **Why:** more tooling and fingerprinting surface in production than the app needs; no direct exploit path.
- **Fix:** copy only the scripts the start, pre-deploy and worker commands run, and set `poweredByHeader: false`.
- **Apply elsewhere:**
  - None found

**Deep vectors — what was checked**

| Vector | Outcome | Location or note |
|---|---|---|
| CSP, clickjacking, HSTS, nosniff, Referrer-Policy, Permissions-Policy | risk surfaced | U6-2; HSTS, nosniff, XFO, Permissions-Policy and token-page `no-referrer` present |
| Authenticated response caching | covered | `private, no-store` on `/api/*` with session cookie, bearer or API key |
| Infrastructure env vars fail closed, no default secrets | risk surfaced | U6-1, U6-3; `JWT_SECRET` placeholder policy and rate-limit rules enforced |
| Build artifacts exclude env files and demo seeds | risk surfaced | U6-6; runner copies selected paths only |
| Container runs as non-root, base image pinned | covered | `omuser` final stage, digest-pinned bases, `dockerfiles:check` |
| Workflows: `pull_request_target`, untrusted input in `run`, token permissions, fork secrets | covered | train and ledger check out `main` only, env-passed values, read-only default token, forks skipped |
| Third-party actions pinned by SHA | covered | every `uses:` pinned by commit SHA; agent-browser binary checksum-verified |
| Merge path integrity (review before merge) | risk surfaced | U6-4, tracked in #741 |
| Supply chain: lockfile, install scripts, dependency confusion | risk surfaced | U6-5, U6-8; `@vereino/*` via `workspace:*`, 5-day age gate, `resolutions` pin known-vulnerable transitive packages |
| Dev-only and example surfaces in production | covered | dev-runtime routes 404 without the supervisor token; `/start` 404 in production; `example` module not enabled |
| API documentation exposure | risk surfaced | U6-7 |
| Upload storage partitions and served content type | covered | platform file route `sandbox` CSP override; Vereino uploads by magic bytes, no SVG (`packages/core/src/file-format.ts`) |
| Shared packages: raw HTML, eval, raw SQL | covered | no `dangerouslySetInnerHTML`, `eval` or raw query in `packages/core`, `packages/db`, `packages/ui` |
| SSRF from `Host` header (custom-domain resolver) | covered | resolver fetches `INTERNAL_APP_ORIGIN` with a secret header, host only as an encoded query value |
| Server actions, `next/image` remote loader | not applicable | no `'use server'` and no `remotePatterns` |
| Backup job secrets and logging | covered | bucket keys passed by environment, stderr sanitized, dumps `age`-encrypted; database URL in `pg_dump` argv inside a single-purpose container |
| Secrets sent to the client via `NEXT_PUBLIC_*` | covered | only `NEXT_PUBLIC_APP_URL` and a test flag read in app code; `env` block exposes `OM_SEARCH_MIN_LEN` only |
| CSRF on cookie-authenticated mutations | not applicable | tracked in #744, outside this unit |
| Vulnerability audit output | inconclusive (next step) | `yarn npm audit` not run (no network in this run); weekly `security.yml` job owns it |

**Next steps — go deeper**

- **[recommended]** Audit `packages/app/scripts/vereino-boot-env.mjs` for fail-open production switches — encryption key and placeholders, `AUTH_SECRET`, `LOOKUP_HASH_PEPPER`, autologin and dev-secret switches in one rule set (U6-1, U6-3).
- Audit `.github/workflows/ci.yml` and the live `main` ruleset for review-before-merge — guard taken from the base branch, pull-request rule and force-push block (U6-4, #741).
- Audit `packages/app/next.config.ts` for a nonce-based CSP — measure what breaks without `'unsafe-inline'` and narrow `connect-src` (U6-2).
- `om-auto-sec-report-pr branch:main --deep-scan` — limited to the PDF and image download routes of `club_core`, `facilities`, `training` and `people`, which inherit the global CSP rather than a sandbox one.

## U7 — Open E25 findings: ASVS rows owned by #743
<!-- sec-unit-status: complete -->
<!-- sec-unit-withheld: 0 - -->

- 5 findings: 0 blocker, 0 major, 3 minor, 1 nit, 1 info; 0 withheld.
- Top OWASP categories: A07, A09, A05. Deep vectors surfaced: token-sibling revocation, silent auth-failure logging, unguarded demo autologin, GCM tag truncation.
- Recommended next run: `om-auto-sec-report-pr branch:main --deep-scan` scoped to the platform `auth` reset and login paths — U7-1 and U7-2 sit in installed platform code that only an app-side wrapper or an upstream fix can close.
- Scope: 80 requirement rows of `docs/compliance/asvs-requirements.md` with owner `#743`, checked against the code at 1e45a949. Verdicts: 40 confirmed by code read, 30 gap confirmed, 6 rows map to 5 findings, 4 still to verify on a running deployment.
- Every "confirmed by code read" row is still **to verify** under the checklist's own rule (platform code read only, no named test). The Next action column names the smallest test or gate that would let the row be called met.

### [Minor] U7-1 A07 Identification and Authentication Failures — `packages/app/node_modules/@open-mercato/core/src/modules/auth/services/authService.ts:165`

- **What:** `confirmPasswordReset` marks only the token it redeemed as used (`authService.ts:169-175`). `requestPasswordReset` (`:134-145`) never retires earlier rows either, so any other unused reset link (60 min) or the Vereino invitation link (48 h, a `PasswordReset` row from `foundation/services/accounts.ts:256-261`) still sets a new password after the account holder has already reset it.
- **Why:** anyone holding an older link e-mail (forwarded invitation, shared mailbox) can take the account over again within the window. The reset also ends every session (`:181`), so the rightful owner is logged out.
- **Fix:** retire all of the user's unused `PasswordReset` rows in the same transaction as the redeemed one, and when a new one is issued. Vereino already does this for invitations (`accounts.ts:259`); wrap or extend the platform reset the same way and add an integration test that a second link answers "invalid" after the first is used.
- **Apply elsewhere:**
  - `packages/app/src/modules/foundation/services/accounts.ts:186` — the Vereino "send reset" path calls `requestPasswordReset` without retiring earlier rows.

### [Minor] U7-2 A09 Security Logging and Monitoring Failures — `packages/app/node_modules/@open-mercato/core/src/modules/auth/api/login.ts:155`

- **What:** a failed password sign-in only emits the non-persistent event `auth.login.failed`, and nothing subscribes to it: no platform or Vereino subscriber exists, and `events.ts:21` only declares it. Login and reset 429 answers from `checkAuthRateLimit` (`login.ts:114-117`) are not logged either. `rateLimitCheck.ts:57-59` also swallows any unexpected error and allows the request without a log line.
- **Why:** password guessing and credential stuffing against staff accounts leave no trace in the kept log, so the digest and alerting in `docs/ops/monitoring.md` cannot see an attack (ASVS V16.3.1, V16.3.3). Vereino's own sessionless limiter does log hits (`foundation/services/sessionless-limits.ts:72-76`).
- **Fix:** add a Vereino subscriber to `auth.login.failed` (and to the rate-limit outcome) that writes a structured warning with a hashed e-mail and the club scope, never the clear address. Add it to a written list of security events (V16.3.3).
- **Apply elsewhere:**
  - `packages/app/node_modules/@open-mercato/core/src/modules/auth/api/reset.ts:36-39` — reset 429s are not logged.

### [Minor] U7-3 A05 Security Misconfiguration — `packages/app/scripts/vereino-boot-env.mjs:59`

- **What:** the Railway boot check refuses `OM_TEST_MODE`, `OM_INTEGRATION_TEST` and a disabled rate limiter, but not `OM_AUTOLOGIN_*` or `OM_ALLOW_DEV_AUTH_SECRET`. `docs/ops/deploy.md:79` says these must never be set, and the boot check does not enforce it.
- **Why:** with `OM_AUTOLOGIN_EMAIL`/`OM_AUTOLOGIN_PASSWORD` set, the platform `GET /api/auth/autologin` (`core/src/modules/auth/api/autologin.ts:22-60`) signs every anonymous visitor in as that user. One stray variable copied from a demo environment becomes an unauthenticated sign-in path (V6.3.4).
- **Fix:** add both variables to the Railway refusals in `vereino-boot-env.mjs`, with a unit test like the existing `OM_TEST_MODE` case.
- **Apply elsewhere:**
  - None found

### [Nit] U7-4 A02 Cryptographic Failures — `packages/app/node_modules/@open-mercato/shared/src/lib/encryption/aes.ts:140`

- **What:** `decryptWithAesGcm` passes the stored tag to `setAuthTag` without checking that it is 16 bytes, and `createDecipheriv` is called without `authTagLength` (`aes.ts:134-137`). Node 24 still accepts truncated GCM tags in that case (deprecated). The strict envelope check `aes.ts:120-130` exists but the decrypt path does not use it.
- **Why:** someone who can write ciphertext columns could forge values against a 32-bit tag instead of a 128-bit one. This needs database write access, so it is defence in depth only (V11.3.3).
- **Fix:** reject tags whose decoded length is not 16 bytes, or pass `{ authTagLength: 16 }`, upstream in the platform. Add a unit test that a truncated tag is refused.
- **Apply elsewhere:**
  - None found

### [Info] U7-5 A05 Security Misconfiguration — `packages/app/src/app/api/docs/openapi/route.ts:12`

- **What:** `GET /api/docs/openapi` and `GET /api/docs/markdown` answer anonymous callers with the full route and schema inventory of every enabled module and the app version. Feature and role metadata is withheld from anonymous callers (`core/src/modules/api_docs/lib/document.ts:58-64`).
- **Why:** the repository is public, so the inventory reveals little that the source does not. It still gives an attacker a ready map and a version string without reading code, and no decision records the exposure (V13.4.5).
- **Fix:** record a decision. Either require a session for both routes, or keep them public and note why in `docs/compliance/asvs-requirements.md`.
- **Apply elsewhere:**
  - `packages/app/src/app/api/docs/markdown/route.ts:12` — same document as Markdown.

**Requirement verdicts (owner #743)**

| Requirement | Prior state | Verdict | Evidence (file:line) | Next action |
|---|---|---|---|---|
| V1.1.1 | to verify | confirmed by code read | Next.js decodes route params once; the only manual decodes are single cookie reads (`foundation/services/identity.ts:143`, `club_core/lib/sign-in-club.ts:32`) | Integration test: a double-encoded slug (`%252e`) answers the public 404 |
| V1.1.2 | partial | gap confirmed | One raw-HTML sink, a constant theme script (`packages/app/src/app/layout.tsx:43`); `eslint.vereino.mjs` has no `react/no-danger` | Add `react/no-danger` to `eslint.vereino.mjs`, allow-listing `layout.tsx` only (nit) |
| V1.2.1 | partial | gap confirmed | as V1.1.2; React text rendering everywhere else | Same lint rule |
| V1.2.3 | to verify | confirmed by code read | No hand-built JSON or script strings; responses use `Response.json`; the only inline script is the constant at `layout.tsx:43` | The V1.1.2 lint rule covers it |
| V1.2.4 | partial | confirmed by code read | Every `${}` in raw SQL is a code constant, a `?` placeholder list or a `quoteIdent`-validated identifier (`club_core/services/club-offboarding.ts:103-106`, `:190-202`, `:465`, `:679`; `training/data/queries.ts:60-93`; `communication/data/queries.ts:238-258`; `foundation/data/queries.ts:125-177`) | Gate in `yarn verify`: flag `${` inside `execute(`/`raw(` templates unless it is an allow-listed helper (`placeholders`, `quoteIdent`, upper-case constants) |
| V1.3.6 | to verify | confirmed by code read | Outbound calls only to env-set heartbeat URLs (`payments/services/invariants.ts:54`, `foundation/lib/worker-heartbeat.ts:49`, `scripts/vereino-ops-signal.mjs:78`), fixed Google endpoints (`foundation/lib/identity.ts:19-20`) and the Resend SDK; the only fetch in enabled platform modules is `communication_channels/lib/oauth-token.ts:55`, fixed Gmail URL, provider not enabled | Lint: `no-restricted-globals` on `fetch` in `src/modules/**` outside the three files |
| V1.3.11 | to verify | confirmed by code read | Mail goes through `channel_resend` as JSON over the Resend HTTPS API (`channel-resend/.../lib/adapter.ts:75-87`); no SMTP header is assembled in app or platform code (`shared/src/lib/email/send.ts:124-150`) | Unit test in `foundation/services/email-templates` that a club name with CR/LF yields a single-line subject |
| V2.1.1 | partial | gap confirmed | Rules live only in Zod schemas and READMEs | Generate a per-flow validation table from the OpenAPI document (info) |
| V2.1.2 | partial | gap confirmed | Cross-field rules spread over specs and READMEs | Collect them per flow next to V2.1.1 (info) |
| V2.1.3 | partial | gap confirmed | No per-user or global limit inventory | Write `docs/compliance/limits.md` listing every count, size and rate limit (info) |
| V2.3.2 | partial | gap confirmed | Depends on the V2.1.3 inventory | Link each limit in that inventory to its enforcing `lib/` function and test |
| V2.3.3 | to verify | confirmed by code read | Commands write in `em.transactional`/`withAtomicFlush` (`payments/commands/orders.ts:342`, `payments/commands/shared.ts:48`); effects post-commit | Integration test: a command failing after its first write leaves no row |
| V3.2.2 | partial | gap confirmed | as V1.1.2 | Same lint rule |
| V3.3.2 | partial | confirmed by code read | `om_selected_tenant`/`om_selected_org` set with `samesite=lax` (`src/components/OrganizationSwitcher.tsx:156`, `:182`); they are selectors re-validated on the server (`foundation/services/route-context.ts:17`), not credentials; no `Secure` (HSTS covers it) | Extend `ENG-TEST-11-security-headers` to assert cookie attributes |
| V3.4.3 | partial | gap confirmed | `script-src 'unsafe-inline'`, `connect-src 'self' https: ws: wss:`, `img-src https:` (`packages/app/next.config.ts:36-40`); nonce CSP deferred | Track the nonce CSP; narrow `connect-src` to named hosts first (minor) |
| V3.4.6 | partial | gap confirmed | Attachment CSP `default-src 'none'; sandbox` without `frame-ancestors` (`next.config.ts:154-157`); `X-Frame-Options: SAMEORIGIN` on the same rule compensates | Add `frame-ancestors 'none'` and assert it in `ENG-TEST-11` (nit) |
| V3.5.3 | to verify | confirmed by code read | Spot check: the only GET-only route that writes is the OAuth callback (`foundation/api/identity/[provider]/callback/route.ts`), bound to a single-use state and cookie (`foundation/services/identity.ts:87-108`); the platform autologin GET writes only when U7-3's variables are set | `yarn verify` step listing GET handlers that reach `commandBus`/`flush` against an allowlist |
| V3.7.2 | partial | confirmed by code read | Platform `/login` redirect is same-origin and rejects `//` paths on the server (`core/src/modules/auth/lib/safeRedirect.ts:1-22`, `api/login.ts:199`) and the client (`auth/frontend/login.tsx:160-170`) | Integration test: sign in with `redirect=https://evil.example` and a backslash form, expect `/backend` |
| V4.1.1 | to verify | confirmed by code read | Text bodies carry `charset=utf-8` (5 CSV routes, `api/docs/markdown/route.ts`); JSON is `application/json` (UTF-8 by RFC 8259) | Pen test checks that the edge does not rewrite `Content-Type` |
| V4.2.1 | to verify | still to verify — needs a running deployment | Railway edge in front of the Node server; nothing in the repository decides it | Pen test of staging: CL.TE/TE.CL/H2 downgrade desync against the edge |
| V5.1.1 | partial | gap confirmed | Upload rules scattered (club_core, activities READMEs, S8.11) | One upload inventory table: route, formats, size, count (info) |
| V5.3.2 | to verify | confirmed by code read | Stored name = timestamp + 12 hex of a UUID + `[a-zA-Z0-9._-]` name under org/tenant segments (`core/src/modules/attachments/lib/drivers/localDriver.ts:29-32`); reads go through `lib/pathContainment` | Integration test: upload a file named `../../x.pdf`, expect a stored path inside the partition |
| V5.4.2 | partial | confirmed by code read | `buildAttachmentContentDisposition` sanitises to ASCII and adds `filename*=UTF-8''` + `encodeURIComponent` (`attachments/lib/security.ts:87-98`, `:179-185`), used at `club_core/api/public-shared.ts:95` | Assert the header in the public-materials integration test |
| V5.4.3 | gap | gap confirmed | No malware scan; staff PDFs served on public pages (`club_core/api/public-shared.ts:75-103`, download disposition + `nosniff`) | Decide: scan, or serve public PDFs re-rendered/flattened; at least record the residual risk (minor) |
| V6.1.3 | partial | gap confirmed | Paths documented separately; API keys are 48-hex secrets, bcrypt-hashed (`core/src/modules/api_keys/services/apiKeyService.ts:118-130`) | One sign-in path inventory with strengths (info) |
| V6.2.7 | to verify | confirmed by code read | No paste handler in `PasswordInput`; `autoComplete` set (`auth/frontend/login.tsx:442`, `frontend/reset/[token]/page.tsx:155`, `:167`) | Browser test: paste into the password field and submit |
| V6.2.9 | to verify | confirmed by code read | `buildPasswordSchema` sets no maximum unless asked (`shared/src/lib/auth/passwordPolicy.ts:138-143`); bcryptjs reads only 72 bytes, so long input is no CPU risk | Unit test: a 128-character password is accepted |
| V6.3.4 | to verify | finding (U7-3) | Autologin variables not refused at boot | Fix U7-3 |
| V6.4.1 | to verify | finding (U7-1) | Single use is atomic (`authService.ts:169-175`), invitations retire older rows (`foundation/services/accounts.ts:259`), but later resets leave the invitation row live | Fix U7-1 |
| V6.4.3 | to verify | finding (U7-1) | Hashed 60-min token, rate-limited, sessions deleted (`authService.ts:134-182`, `auth/api/reset.ts:36-110`); sibling tokens survive | Fix U7-1; integration test for reset single use |
| V6.8.2 | partial | confirmed by code read | Id token from a direct TLS back-channel exchange with PKCE S256 (`foundation/services/identity-providers.ts:28-53`), claims checked (`foundation/lib/identity.ts:117-131`); acceptable under OIDC Core 3.1.3.7, decision V-S04 | Keep partial; cite OIDC Core 3.1.3.7 in the row |
| V7.2.3 | to verify | confirmed by code read | 32 `randomBytes`, stored as HMAC-SHA256 (`core/src/modules/auth/lib/tokenHash.ts:46-52`, `services/authService.ts:95-101`) | Unit test of token length in the Vereino session path (`foundation/services/identity.ts:199`) |
| V8.1.2 | partial | gap confirmed | No per-field read/write matrix | Field matrix per module (info) |
| V8.2.1 | partial | gap confirmed | A-2 insufficient-feature inventory open | Extend `route-isolation:check` inventories with a feature-less probe per route |
| V8.2.2 | partial | gap confirmed | Cross-club met by #628; in-club scope inventory open | In-club scope probes in the same inventory |
| V8.2.3 | partial | gap confirmed | Only PESEL and medical date tested | Inventory sensitive fields and a test per field |
| V9.1.1 | partial | confirmed by code read | HMAC checked with `timingSafeEqual` before the payload is parsed (`shared/src/lib/auth/jwt.ts:300-307`); Google side per V6.8.2 | Unit test: tampered payload with original signature is refused |
| V9.1.2 | to verify | confirmed by code read | `alg` header never read; verification always HS256 (`jwt.ts:282`, `:295-304`) | Unit test: an `alg: none` token and an HS512 token are refused |
| V9.2.1 | to verify | confirmed by code read | `exp` checked (`jwt.ts:312`); the check is skipped when `exp` is absent, but `signJwt` always sets it (`:284`) and the one Vereino signer passes none (`foundation/services/identity.ts:219`) | Unit test: expired token refused; prefer rejecting a missing `exp` upstream |
| V9.2.2 | to verify | confirmed by code read | `mfa_pending` tokens refused outside MFA routes (`shared/src/lib/auth/server.ts:372-377`, `:420-426`); per-audience keys | Unit test: customer-audience token refused on a staff route |
| V9.2.3 | to verify | confirmed by code read | `aud` and `iss` compared on the default path (`jwt.ts:313-318`) | Same unit test as V9.2.2 |
| V9.2.4 | to verify | confirmed by code read | Per-audience key = HMAC-SHA256(`JWT_SECRET`, label+audience) (`jwt.ts:182-213`) | Covered by the V9.2.2 test |
| V11.2.1 | to verify | confirmed by code read | Vereino uses `node:crypto` only; platform `node:crypto` + `bcryptjs` | Add crypto libraries other than these to `forbidden-packages:check` |
| V11.2.3 | to verify | confirmed by code read | JWT HS256 with 256-bit derived key, `JWT_SECRET` ≥ 32 chars enforced in production (`jwt.ts:75`, `:146-154`); AES-256-GCM; PBKDF2-SHA512 310 000 (`shared/src/lib/encryption/kms.ts:155-158`) | Boot test exists (`ENG-TEST-12-13-boot-env`); cite it |
| V11.3.1 | to verify | confirmed by code read | AES-256-GCM, fresh 12-byte IV per value (`aes.ts:82-90`) | Unit test: two encryptions of one value differ |
| V11.3.2 | to verify | confirmed by code read | same file | Same test |
| V11.3.3 | to verify | finding (U7-4) | Tag checked by GCM but its length not pinned (`aes.ts:134-157`) | Fix U7-4; tamper test |
| V11.4.1 | to verify | confirmed by code read | Vereino: 14 `createHash('sha256')`, 6 `createHmac('sha256')`, no MD5/SHA-1 | Lint: `no-restricted-syntax` on other hash names |
| V11.4.2 | to verify | confirmed by code read | bcrypt cost 10 (`authService.ts:179`, `auth/lib/setup-app.ts:347`), OWASP's minimum | Record the choice; consider 12 with a login-latency check |
| V11.4.3 | to verify | confirmed by code read | SHA-256 for link and preview tokens (`foundation/lib/token-link.ts`, `people/lib/departure-token.ts`) | Existing unit tests; cite them |
| V11.5.1 | to verify | confirmed by code read | OAuth state 32 bytes (`foundation/services/identity.ts:54`), link tokens 32 bytes (`tokenHash.ts:46-48`); `Math.random` only for the public transfer reference `GW-XXXX` (`payments/lib/payer-summary.ts:20-28`), not a secret | Note the payer code as non-secret in the row |
| V11.6.1 | to verify | confirmed by code read | Stripe webhook verified by `stripe.webhooks.constructEvent` (`gateway-stripe/.../lib/webhook-handler.ts:34`); JWT HMAC as above; `age` backup keys are operator-generated (ops) | Ops check of the `age` key procedure |
| V13.1.1 | partial | gap confirmed | Outbound: PostgreSQL, Redis, Resend, Stripe, Google OAuth, three heartbeat URLs (see V1.3.6) | Add Google and the heartbeat monitor to `docs/compliance/processors.md` (info) |
| V13.4.3 | to verify | still to verify — needs a running deployment | Next.js serves no directory listings by code | Pen test: directory listing and `TRACE`/`OPTIONS` at the Railway edge |
| V13.4.5 | partial | finding (U7-5) | Anonymous OpenAPI and Markdown docs | Fix U7-5 (decision) |
| V14.1.1 | partial | gap confirmed | No protection levels | Define levels in `ropa.md` (info) |
| V14.1.2 | partial | gap confirmed | Rules piecemeal | Requirement set per level (info) |
| V14.2.1 | partial | still to verify — needs a running deployment | Tokens in link paths by design, `no-referrer`/`no-store` (`next.config.ts:165-195`) | Pen test/ops: confirm Railway edge and access logs do not keep request paths with tokens |
| V14.2.2 | partial | confirmed by code read | CRUD response cache off unless `ENABLE_CRUD_API_CACHE` (`shared/src/lib/crud/cache.ts:15-19`) and keyed per tenant, org and user (`crud/factory.ts:1055-1068`); Redis otherwise holds state markers and counters | Assert `ENABLE_CRUD_API_CACHE` unset in the boot check |
| V14.2.3 | partial | gap confirmed | No trackers in code; CSP `connect-src https:` (`next.config.ts:40`) does not enforce it | Narrow `connect-src` (nit) |
| V14.3.3 | to verify | confirmed by code read | `sessionStorage`: member person id and selection (`packages/ui/src/member/member-context.ts:228`); `localStorage`: undo metadata (`ui/src/backend/operations/store.ts:22`, `:113`; undo is actor-bound, `audit_logs/api/audit-logs/actions/undo/route.ts:87-93`), login tenant id (`auth/frontend/login.tsx:26`), table/filter state; no session token | Note that undo entries survive logout until the next sign-in (`login.tsx:270`, `:325`) |
| V15.2.3 | partial | gap confirmed | Scaffold modules unregistered (`src/modules.ts:91`) but in the image; dev-runtime routes closed without the supervisor token (`shared/src/lib/dev-runtime/server.ts:45-60`) | Exclude `src/modules/example*` and `ratelimit_probe` in `.dockerignore` (nit) |
| V15.3.1 | to verify | gap confirmed | Response schemas exist per route (`openApi`), no test compares returned keys | Contract test: response keys ⊆ declared schema for public routes |
| V15.3.2 | partial | gap confirmed | Three heartbeat fetches follow redirects (V1.3.6 files) | Pass `redirect: 'error'` (nit) |
| V15.3.3 | to verify | confirmed by code read | Loose route schemas only feed commands that parse strict schemas (`facilities/api/closures/route.ts:31`, `:79`; `facilities/commands/closures.ts:158`); `z.object` strips unknown keys; scope from server | Integration test: POST with `tenantId`/`organizationId` of club B is ignored |
| V15.3.5 | partial | gap confirmed | No `eqeqeq`; only `== null` idioms found | `eqeqeq: ['error', 'always', { null: 'ignore' }]` (nit) |
| V15.3.6 | to verify | confirmed by code read | Zod 4.6.7 drops `__proto__` in objects and records (`node_modules/zod/v4/core/schemas.js:966-972`, `:1743-1764`) | Unit test: a body with `__proto__` parses to a plain object |
| V15.3.7 | to verify | confirmed by code read | Repeated query keys become arrays (`shared/src/lib/crud/query-params.ts:39-52`), which `z.string()` refuses (400) | Unit test on one list route |
| V16.2.1 | to verify | gap confirmed | Lines carry module, tenant, organization; user id only on lifecycle events (`src/app/api/[...slug]/route.ts:496-501`) | Add `userId` to the S15.1 field set (info) |
| V16.2.2 | to verify | still to verify — needs a running deployment | pino epoch-ms `time`; host clock is Railway's | Ops/pen test: compare log timestamps with an NTP reference |
| V16.2.4 | partial | gap confirmed | Next.js unhandled lines plain text | Route Next errors through the logger (nit) |
| V16.2.5 | partial | gap confirmed | pino redact paths (`shared/src/lib/logger/transport.server.ts:79-81`); no general check | Log-content test over a seeded run (info) |
| V16.3.1 | partial | finding (U7-2) | `auth.login.failed` unlogged | Fix U7-2 |
| V16.3.2 | to verify | gap confirmed | 403/404 answers not logged | Log denials with route and feature (info) |
| V16.3.3 | gap | gap confirmed | No security event list; platform auth 429s unlogged (U7-2) | Write the list; fix U7-2 |
| V16.3.4 | partial | confirmed by code read | CRUD routes log every unexpected error regardless of telemetry (`shared/src/lib/crud/factory.ts:700-711`); the dispatcher's `reportError` is silent unless `TELEMETRY_BACKEND` is set (`src/app/api/[...slug]/route.ts:526-528`) | Add `TELEMETRY_BACKEND=console` to the `docs/ops/deploy.md` variable table |
| V16.4.1 | to verify | confirmed by code read | pino JSON (dependency of `@open-mercato/shared`, `package.json:130`); the console fallback writes raw `key=value` (`logger/transport.console.ts:17-31`) only if pino fails to load | Boot assertion that the pino transport is active |
| V16.5.1 | to verify | confirmed by code read | Generic 500 body with `requestId` (`crud/factory.ts:712-719`); non-CRUD throws re-thrown to Next.js (`[...slug]/route.ts:538`) | Pen test confirms the production 500 body is empty/generic |
| V16.5.2 | to verify | gap confirmed | Missing transport mapped (`foundation/lib/dispatch-rules.ts:154`); Stripe/Resend outage paths untested | Integration test with the e-mail sender seam failing |
| V16.5.3 | partial | confirmed by code read | Scope fails closed (#628); auth limiter fails open by design, logged by the service (`shared/src/lib/ratelimit/service.ts:45-55`) except the catch-all at `auth/lib/rateLimitCheck.ts:57-59` | Covered by U7-2's fix |

**Deep vectors — what was checked**

| Vector | Outcome | Location or note |
|---|---|---|
| JWT algorithm confusion | covered | `alg` ignored, HS256 only (`jwt.ts:295-304`) |
| JWT expiry, audience, issuer | covered | `jwt.ts:312-318`; missing `exp` accepted but never issued |
| Legacy JWT fallback | covered | off unless `JWT_LEGACY_CUTOVER_AT` is set (`jwt.ts:61-73`, `:328-336`) |
| Reset/invite token single use and sibling revocation | risk surfaced | U7-1 |
| Session token entropy | covered | 32 bytes, HMAC at rest |
| Password hashing | covered | bcrypt cost 10 (minimum) |
| Id-token signature (V-S04) | covered | back-channel + PKCE, claims checked |
| SQL injection in raw SQL | covered | constants, placeholders, `quoteIdent` only |
| SSRF and redirect following | covered | env-set targets only; redirects followed (nit, V15.3.2) |
| Mail header injection | covered | Resend JSON API, no SMTP headers built |
| Content-Disposition encoding | covered | sanitised + RFC 5987 |
| Framing of attachment files | covered | `X-Frame-Options` present; `frame-ancestors` missing (nit) |
| Open redirect on `/login` | covered | `safeRedirect.ts` |
| Prototype pollution | covered | Zod strips `__proto__` |
| Parameter pollution | covered | duplicates become arrays, refused |
| Browser storage of secrets | covered | no tokens in storage |
| Error body leakage | covered | generic 500 + `requestId` |
| Auth failure logging | risk surfaced | U7-2 |
| Debug/demo paths in production | risk surfaced | U7-3; dev-runtime closed |
| AES-GCM tag truncation | risk surfaced | U7-4 |
| API surface disclosure | risk surfaced | U7-5 |
| Request smuggling at the edge | inconclusive | needs staging (V4.2.1) |

**Next steps — go deeper**

- **[recommended]** `om-auto-sec-report-pr branch:main --deep-scan` scoped to the platform `auth` module (reset, login, autologin, profile password change) — U7-1 to U7-3 show its token lifecycle and logging rely on code that Vereino neither wraps nor tests.
- Audit `packages/app/src/modules/foundation` for a security-event subscriber set (login failure, 429, 403, reset, role change) — closes V16.3.1 to V16.3.3 in one change.
- Audit the Railway staging edge for request smuggling, `TRACE`, directory listings, clock sync and access-log retention of token paths — the four rows no code read settles (V4.2.1, V13.4.3, V14.2.1, V16.2.2).
- Audit `yarn verify` for an S5.8 raw-SQL interpolation gate and a `react/no-danger` lint rule — together they let five V1 and V3 rows be called met.

## Limits

- Findings are aggregated from per-unit heuristic analysis by code reading; confirm before acting. No application, test or deployment was run for this review.
- Apply-elsewhere and next-step pointers are suggestions, not verified vulnerabilities.
- A whole-codebase review hides less per-unit context than a large PR window, but the spot-checked areas named in the next steps were not read line by line.
- This report does not replace the external penetration test of staging (#743).

## Appendix — queue

### 2026-11-26

- U1 `om-auto-sec-report-pr` over the sign-in, session and sessionless route entry points — complete · withheld: 0
- U2 over `packages/app/src/modules/payments` — complete · withheld: 0
- U3 over `packages/app/src/modules/facilities` and `activities` — complete · withheld: 0
- U4 over `packages/app/src/modules/people`, `groups` and `communication` — complete · withheld: 0
- U5 over `packages/app/src/modules/club_core`, `foundation`, `training` and the example modules — complete · withheld: 1
- U6 over platform configuration, deployment, CI and the shared packages — complete · withheld: 0
- U7 over the 80 rows of `docs/compliance/asvs-requirements.md` owned by #743 — complete · withheld: 0
