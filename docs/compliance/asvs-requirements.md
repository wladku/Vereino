# OWASP ASVS 5.0 requirement-level map, levels 1 and 2

> Part of [`asvs-checklist.md`](asvs-checklist.md) (open item A-1, #742). Approved together with it.

Every level 1 and level 2 requirement of OWASP ASVS 5.0.0 (253 of 345; level 3 is out of scope, S8.1), mapped to
the Vereino control that meets it, the evidence, a state and an owner. Source: the release CSV,
<https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv>,
read 2026-11-25. The ASVS is © OWASP Foundation under CC BY-SA 4.0; this file cites requirement ids only, and the
**Topic** column is a short summary in our own words — read the requirement text in the source before judging a row.

## How to read it

- **State** uses the vocabulary of [`asvs-checklist.md`](asvs-checklist.md#how-to-read-it): **met** (a named test,
  `yarn verify` step or file proves it), **partial** (the control exists, the gap is named), **gap** (no control),
  **to verify** (a control is designed or seen in the code, no evidence collected), **n/a** (the feature does not exist
  in Vereino, reason given). Platform behaviour read only in the installed source is **to verify**, never met.
- **Owner** is the issue that closes the row: the E25 stories of epic #734, or #747. **#743** (internal security
  review, then an external penetration test of staging) owns every "to verify" no story covers: its internal pass
  collects the evidence or turns the row into a finding.
- Paths: `foundation/…`, `people/…` and other module names are under `packages/app/src/modules/`; `OM/…` is the
  installed platform source `packages/app/node_modules/@open-mercato/…` (read-only, S3.1).
- First mapped 2026-11-25 (#742) from the code on `main` at that date. A PR that changes a control updates its rows
  here and the section row in `asvs-checklist.md`.

## Summary

| Chapter | met | partial | gap | to verify | n/a | Total |
|---|---|---|---|---|---|---|
| V1 Encoding and Sanitization | 9 | 3 | 0 | 4 | 11 | 27 |
| V2 Validation and Business Logic | 5 | 5 | 0 | 1 | 0 | 11 |
| V3 Web Frontend Security | 6 | 8 | 1 | 2 | 2 | 19 |
| V4 API and Web Service | 0 | 0 | 0 | 4 | 6 | 10 |
| V5 File Handling | 5 | 2 | 1 | 1 | 0 | 9 |
| V6 Authentication | 5 | 4 | 8 | 5 | 13 | 35 |
| V7 Session Management | 5 | 8 | 4 | 1 | 0 | 18 |
| V8 Authorization | 3 | 4 | 0 | 0 | 0 | 7 |
| V9 Self-contained Tokens | 1 | 1 | 0 | 5 | 0 | 7 |
| V10 OAuth and OIDC | 6 | 0 | 0 | 0 | 23 | 29 |
| V11 Cryptography | 0 | 1 | 1 | 12 | 0 | 14 |
| V12 Secure Communication | 0 | 2 | 0 | 6 | 1 | 9 |
| V13 Configuration | 1 | 4 | 3 | 5 | 0 | 13 |
| V14 Data Protection | 1 | 7 | 0 | 1 | 0 | 9 |
| V15 Secure Coding and Architecture | 1 | 7 | 0 | 5 | 0 | 13 |
| V16 Security Logging and Error Handling | 0 | 7 | 2 | 7 | 0 | 16 |
| V17 WebRTC | 0 | 0 | 0 | 0 | 7 | 7 |
| **All** | **48** | **63** | **20** | **59** | **63** | **253** |

## Requirements

### V1 Encoding and Sanitization

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V1.1.1 | 2 | Decode input to canonical form once | Next.js decodes path/query once; Zod parses the decoded values (`data/validators.ts` per module). No double-decoding path was checked | to verify | #743 |
| V1.1.2 | 2 | Encode as the last step, per interpreter | React JSX escapes at render; e-mails render club text as escaped text (`foundation/services/email-templates.ts`, R09). Gap: no lint rule bans raw-HTML sinks (`dangerouslySetInnerHTML`) | partial | #743 |
| V1.2.1 | 1 | Context-aware HTML output encoding | React escaping for pages and e-mails; no raw-HTML sink in Vereino modules (grep 2026-11-25). Gap: nothing in `yarn verify` keeps it so | partial | #743 |
| V1.2.2 | 1 | Safe URL building, safe schemes only | User-entered links must be absolute http(s) (`club_core/lib/publication.ts` `isPublicLinkUrl`, `javascript:` refused in `club_core/lib/__tests__/publication.test.ts`); path parts built with `encodeURIComponent` | met | — |
| V1.2.3 | 1 | No JavaScript/JSON injection | Responses through `Response.json`/`NextResponse.json`; no hand-built script or JSON strings found. No test or gate proves it | to verify | #743 |
| V1.2.4 | 1 | Parameterised database queries | MikroORM; raw SQL with `?` parameters, interpolation only of code constants (S5.8; e.g. `foundation/data/queries.ts`). Gap: no gate enforces S5.8; raw SQL also in `club_core/services/club-offboarding.ts` | partial | #743 |
| V1.2.5 | 1 | OS command injection | No runtime OS command calls in Vereino modules or `packages/*` (no `child_process`; lint bans it in `lib/`, `eslint.vereino.mjs`) | n/a | — |
| V1.2.6 | 2 | LDAP injection | No LDAP in Vereino | n/a | — |
| V1.2.7 | 2 | XPath injection | No XPath queries; the XLSX reader walks a parsed tree (`people/lib/import-xlsx.ts`) | n/a | — |
| V1.2.8 | 2 | LaTeX injection | No LaTeX processor used | n/a | — |
| V1.2.9 | 2 | Regex metacharacter escaping | `new RegExp` only from code constants (`payments/lib/bank-matching.ts`, `payments/lib/payer-summary.ts`); user input never becomes a pattern | met | — |
| V1.3.1 | 1 | Sanitise WYSIWYG HTML input | No rich-text/HTML input in Vereino; club text is stored and rendered as plain text (R09, `foundation/services/email-templates.ts`) | n/a | — |
| V1.3.2 | 1 | No eval or dynamic code | Production CSP has no `'unsafe-eval'` and the UI runs without violations (`ENG-TEST-11-security-headers`); `no-implied-eval` via `strictTypeChecked` in `yarn lint` | met | — |
| V1.3.3 | 2 | Sanitise before dangerous contexts | Club colour allowlisted hex (`packages/core/src/club-accent.ts`, test `club-accent.test.mjs`); file names stripped of paths/control chars (`storedFileName`, `file-format.test.mjs`) | met | — |
| V1.3.4 | 2 | User-supplied SVG | SVG refused by magic bytes (`packages/core/src/file-format.ts`; `file-format.test.mjs` asserts an SVG is not detected) | met | — |
| V1.3.5 | 2 | Scriptable template content (Markdown, CSS) | No Markdown/BBCode/XSL input; the only user CSS value is the hex club colour (`club-accent.ts`, tested) | met | — |
| V1.3.6 | 2 | Server-side request forgery | Vereino fetches only env-configured URLs (`payments/services/invariants.ts` heartbeat, `foundation/services/identity-providers.ts`). Enabled platform modules not checked for URL fetches | to verify | #743 |
| V1.3.7 | 2 | Template injection | No templates built from input: e-mail templates are React code, club text goes in as params | n/a | — |
| V1.3.8 | 2 | JNDI injection | Java-only; not applicable to Node.js | n/a | — |
| V1.3.9 | 2 | Memcache injection | No memcache; Redis is reached only through platform queue/cache clients | n/a | — |
| V1.3.10 | 2 | Format string handling | No user-controlled format strings; i18n formats catalog strings with params | n/a | — |
| V1.3.11 | 2 | SMTP/IMAP injection | Mail goes through the platform `sendEmail` to a provider transport; recipients validated `z.email()`. Transport header handling not verified | to verify | #743 |
| V1.4.1 | 2 | Memory-safe buffer handling | Managed runtime (TypeScript on Node.js), no unmanaged code | n/a | — |
| V1.4.2 | 2 | Integer range/overflow checks | Money in grosz as bounded integers (`payments/data/validators.ts` `amountSchema` `.int().min(1).max(MAX_AMOUNT)`); paging `max(100)` | met | — |
| V1.4.3 | 2 | Release memory, no dangling pointers | Garbage-collected runtime, no manual memory | n/a | — |
| V1.5.1 | 1 | XML parser hardening (XXE) | XLSX parts with a DOCTYPE refused, entity processing off (`people/lib/import-xlsx.ts`); test "refuses any part with a DOCTYPE" in `people/lib/__tests__/import-file.test.ts` | met | — |
| V1.5.2 | 2 | Safe deserialization | Only `JSON.parse` into plain data, then Zod (`data/validators.ts`; e.g. `payments/api/bank-imports/route.ts`); no typed object deserializers | met | — |

### V2 Validation and Business Logic

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V2.1.1 | 1 | Documented input validation rules | Field rules in Zod schemas (`data/validators.ts`, published as OpenAPI by `yarn generate`) and module READMEs. Gap: no per-flow validation document | partial | #743 |
| V2.1.2 | 2 | Documented cross-field consistency rules | Combined rules in specs and READMEs (e.g. place hierarchy, rental slots). Gap: not collected per flow | partial | #743 |
| V2.1.3 | 2 | Documented business limits, per user and global | Some limits documented (`club_core/README.md`, `activities/README.md`: file counts, sizes; import 1000 rows). Gap: no inventory of per-user and global limits | partial | #743 |
| V2.2.1 | 1 | Positive input validation | Zod enums, ranges, patterns on every mutating route; 422 asserted across module integration tests (e.g. `TEST-036-request-security`) | met | — |
| V2.2.2 | 1 | Validation at trusted server layer | Routes parse bodies on the server (Zod via `makeCrudRoute` or shared route helpers); client checks are UX only; `TEST-036-request-security` sends invalid bodies directly | met | — |
| V2.2.3 | 2 | Related items checked together | Pure rules with 100 % coverage, e.g. `club_core/lib/places.ts` `wouldCreateCycle`, `packages/core/src/interval.ts`; enforced in commands | met | — |
| V2.3.1 | 1 | Steps in expected order | Status machines declared once (`packages/core/src/transitions.ts`, `transitions.test.mjs`); refused moves → 409; OAuth state marker single-use (`foundation/services/identity.ts`) | met | — |
| V2.3.2 | 2 | Business limits enforced as documented | Limits enforced in `lib/` (e.g. `facilities/lib/incidents.ts` photo cap, `people/lib/import-sheet.ts`). Gap: depends on V2.1.3 inventory | partial | #743 |
| V2.3.3 | 2 | All-or-nothing transactions | Commands write in `em.transactional`; effects post-commit (S5.7). No rollback test collected | to verify | #743 |
| V2.3.4 | 2 | Locking against double-booking | Row/advisory locks (`FOR UPDATE`, `pg_advisory_xact_lock`); `TEST-085-concurrent-internal-bookings`, `ISSUE-549-concurrent-cash-acceptances` | met | — |
| V2.4.1 | 2 | Anti-automation on functions | Honeypot (`facilities/commands/requests.ts`, `TEST-036-request-security`); platform `lib/ratelimit` on every sessionless and sign-in route, per client, per token, per address and per account, counters in Redis (#738, `ISSUE-738-sessionless-rate-limits`, *Sessionless route inventory* in `asvs-checklist.md`). Gap: per-client counters share one key until the proxy depth is set (A-8); no edge limiting | partial | #739 |

### V3 Web Frontend Security

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V3.2.1 | 1 | Prevent wrong-context rendering | `nosniff` on all paths, `sandbox` CSP on attachment files (`packages/app/next.config.ts`); file types from magic bytes (`file-format.ts`); `ENG-TEST-11-security-headers` | met | — |
| V3.2.2 | 1 | Text rendered via safe functions | React text nodes; no `innerHTML`/`dangerouslySetInnerHTML` in Vereino code (grep 2026-11-25). Gap: no lint rule keeps it so | partial | #743 |
| V3.3.1 | 1 | Secure attribute and cookie prefix | `Secure` on `auth_token`/`session_token` in production (spike #448 §4, observed). Gap: no `__Host-`/`__Secure-` prefix (platform names) | partial | #744 |
| V3.3.2 | 2 | SameSite set per cookie purpose | Session and OAuth state cookies `SameSite=Lax` (spike §4; `foundation/services/identity.ts`). Gap: `om_selected_tenant`/`om_selected_org` attributes not checked | partial | #743 |
| V3.3.3 | 2 | `__Host-` prefix on cookies | Not used: platform cookie names `auth_token`, `session_token`; matters with club subdomains (D-036) | gap | #744 |
| V3.3.4 | 2 | HttpOnly on session cookies | `auth_token`, `session_token` `HttpOnly` (spike #448 §4, observed on production build); state cookie `httpOnly` (`foundation/services/identity.ts`) | met | — |
| V3.4.1 | 1 | HSTS on every response | `max-age=63072000; includeSubDomains` on `/:path*` in production (`next.config.ts`); asserted by `ENG-TEST-11-security-headers` | met | — |
| V3.4.2 | 1 | CORS origin fixed or allowlisted | No `Access-Control-Allow-Origin` set by Vereino, platform `core` or `shared` (grep 2026-11-25): same-origin only | n/a | — |
| V3.4.3 | 2 | Content-Security-Policy present | CSP without `'unsafe-eval'` (`ENG-TEST-11-security-headers`). Gap: `script-src 'unsafe-inline'`, broad `connect-src https: ws: wss:` and `img-src https:` | partial | #743 |
| V3.4.4 | 2 | `nosniff` on all responses | `X-Content-Type-Options: nosniff` on `/:path*` (`next.config.ts`); asserted by `ENG-TEST-11-security-headers` | met | — |
| V3.4.5 | 2 | Referrer policy | `strict-origin-when-cross-origin` globally, `no-referrer` on token pages (`next.config.ts`); `ENG-TEST-11-security-headers` | met | — |
| V3.4.6 | 2 | CSP frame-ancestors on every response | `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` (`next.config.ts`). Gap: the attachment-file CSP override has no `frame-ancestors`; not asserted in a test | partial | #743 |
| V3.5.1 | 1 | Cross-origin request validation | `src/proxy.ts` refuses a cookie-authenticated `POST`/`PUT`/`PATCH`/`DELETE` on `/api` from a foreign `Origin` or with `Sec-Fetch-Site: cross-site` with 403 (ENG-Q-11, #744); bearer, API-key and webhook requests exempt; `SameSite=Lax` below it. `ISSUE-744-cross-site-api-check`, `cross-site-request.test.mjs` | met | — |
| V3.5.2 | 1 | No bypass of CORS preflight | Not relied on: a simple (`text/plain`) cross-site request with the cookie is refused by its `Origin` / `Sec-Fetch-Site` before the handler (#744); the bearer and API-key exemption rests on the preflight, which no Vereino route grants (V3.4.2) | met | — |
| V3.5.3 | 1 | No sensitive action via safe methods | Rule S8.6/S8.9: `GET` never changes state, link pages `POST` from a button. No test or gate checks it app-wide | to verify | #743 |
| V3.5.4 | 2 | Separate apps on separate hostnames | Product site at `vereino.org`, each club on its own subdomain (D-036). Not live yet; a sibling club subdomain passes the cross-site check by the owner's decision on ENG-Q-11 (#744), so club separation rests on host-only session cookies (D-036) | to verify | #743 |
| V3.5.5 | 2 | postMessage origin checks | No `postMessage` listener in Vereino code | n/a | — |
| V3.7.1 | 2 | Supported client technologies only | Next.js/React only, no plugins; dependency updates via Renovate (`renovate.json`) | met | — |
| V3.7.2 | 2 | Redirects only to allowlisted hosts | Google sign-in redirect sanitised to same origin; `TEST-S01-google-sign-in` refuses `https://evil.example`. Gap: platform `/login` redirect not covered by a Vereino test | partial | #743 |

### V4 API and Web Service

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V4.1.1 | 1 | Correct Content-Type with charset | CSV exports send `text/csv; charset=utf-8`, files their detected type; JSON via `Response.json` (no charset parameter). Not checked app-wide | to verify | #743 |
| V4.1.2 | 2 | HTTP→HTTPS redirect only for browser endpoints | Depends on Railway edge behaviour for `/api`; HSTS set (`next.config.ts`). Not checked on the deployment | to verify | #735 |
| V4.1.3 | 2 | Intermediary headers not client-overridable | `X-Forwarded-For` trust depends on `RATE_LIMIT_TRUST_PROXY_DEPTH` (default 0); `src/proxy.ts` overwrites `x-next-url`. Boot warns while unset; measuring steps in `docs/ops/deploy.md` → *Rate limits*; depth to measure on staging (A-8) | to verify | #739 |
| V4.2.1 | 2 | Consistent HTTP message boundaries | Railway edge in front of the Node.js server; no request-smuggling check done | to verify | #743 |
| V4.3.1 | 2 | GraphQL query cost limits | No GraphQL API | n/a | — |
| V4.3.2 | 2 | GraphQL introspection off | No GraphQL API | n/a | — |
| V4.4.1 | 1 | WSS for WebSockets | No WebSocket use in Vereino code (CSP still allows `ws:`/`wss:`, see V3.4.3) | n/a | — |
| V4.4.2 | 2 | WebSocket handshake Origin check | No WebSockets | n/a | — |
| V4.4.3 | 2 | Dedicated WebSocket session tokens | No WebSockets | n/a | — |
| V4.4.4 | 2 | WebSocket tokens from HTTPS session | No WebSockets | n/a | — |

### V5 File Handling

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V5.1.1 | 2 | Documented types and sizes per upload | Per-upload formats and sizes in `club_core/README.md`, `activities/README.md`, S8.11. Gap: no single inventory (bank statements, import file, incident photos scattered) | partial | #743 |
| V5.2.1 | 1 | Size limits on accepted files | `checkFileBytes` max bytes per kind (`packages/core/src/file-format.ts`, `file-format.test.mjs`); import 5 MB, statements 2 MB (`payments/lib/bank-statement.ts`); bounded `readUploadForm` | met | — |
| V5.2.2 | 1 | Extension and content type match | Format read from magic bytes, stored extension set from the format (`file-format.ts` `storedFileName`; `file-format.test.mjs`); used by `club_core/api/uploads.ts` and others | met | — |
| V5.2.3 | 2 | Archive size and entry-count limits | XLSX import: 500 entries, 30 MB inflated budget, streamed (`people/lib/import-xlsx.ts`); tests in `people/lib/__tests__/import-file.test.ts` | met | — |
| V5.3.1 | 1 | Uploads never executed server-side | All Vereino uploads in the `privateAttachments` partition (`*_PARTITION` constants), served only through route handlers with `nosniff` (`club_core/api/public-shared.ts`) | met | — |
| V5.3.2 | 1 | File paths from trusted data | Vereino passes `storedFileName` names; platform builds paths as timestamp + random + sanitised name (`@open-mercato/core` `attachments/lib/storage.ts`). Platform part not tested | to verify | #743 |
| V5.4.1 | 2 | Ignore user filenames, set Content-Disposition | Vereino routes send fixed or generated names (`people/api/persons/[id]/photo/route.ts`, CSV exports); uploaded names cleaned by `storedFileName` | met | — |
| V5.4.2 | 2 | Encode served file names (RFC 6266) | `filename*=UTF-8''` + `encodeURIComponent` (`facilities/api/incidents/[id]/photos/[photoId]/route.ts`). Gap: platform `contentDisposition` used by `club_core/api/public-shared.ts` not verified | partial | #743 |
| V5.4.3 | 2 | Antivirus scan of untrusted files | None in 1.0 (S8.11). Staff-uploaded PDFs (section materials, place regulations) are served on public pages, contrary to S8.11's premise | gap | #743 |

### V6 Authentication

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V6.1.1 | 1 | Documented brute-force and lockout defences | *Sessionless route inventory* in `asvs-checklist.md` documents the sign-in and password-reset limits (platform per client and per client and address, Vereino per account) and the accepted lockout trade-off; S8.6 of `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`; production settings in `docs/ops/deploy.md` → *Rate limits* (#738) | met | — |
| V6.1.2 | 2 | Documented banned context words | No list of club, product or role words exists; specced as part of the app-owned password check (#779) | gap | #779 |
| V6.1.3 | 2 | All sign-in paths documented together | Password (platform `auth`), Google (`.ai/specs/2026-10-27-vereino-social-sign-in.md`), invitation/reset links (`packages/app/src/modules/foundation/services/accounts.ts`), API keys (`api_keys` in `packages/app/src/modules.ts`) are described separately; no single inventory with strengths | partial | #743 |
| V6.2.1 | 1 | Minimum password length | `OM_PASSWORD_MIN_LENGTH=12` on production and staging (`docs/ops/deploy.md` → *Variables*, *Password policy*; #747); the platform checks it on the server (`OM/shared/src/lib/auth/passwordPolicy.ts`): `mercato auth set-password` refused a 7-character password and accepted a 19-character one on a throwaway database (`.ai/runs/2026-11-25-issue-747-default-super-admin-password.md`). The browser forms still show the platform default of 6 (#779) | met | — |
| V6.2.2 | 1 | Users can change their password | `/club/profile` links to the platform change-password page; `E06-S22` (`packages/app/.ai/qa/tests/people/E06-S22-profile-wards-guardians.spec.ts`) opens it and sees a password field | met | — |
| V6.2.3 | 1 | Change asks for current password | Spike E3 item 5 (`.ai/runs/2026-11-20-issue-448-platform-spike-e3.md`): `PUT /api/auth/profile` requires `currentPassword` (`OM/core/src/modules/auth/api/profile/route.ts`) | met | — |
| V6.2.4 | 1 | Reject common passwords | No common-password list check in platform `auth` or Vereino; app-owned check to be specced (#779) | gap | #779 |
| V6.2.5 | 1 | No character-class rules | `OM_PASSWORD_REQUIRE_DIGIT`, `_UPPERCASE` and `_SPECIAL` set to `false` in `docs/ops/deploy.md` (#747): the server accepts a lower-case passphrase (checked with `mercato auth set-password`). Code read: the platform's browser forms (change password, reset, user create/edit) read the policy in the browser, where the server variables are not set, so they still demand the three classes | partial | #779 |
| V6.2.6 | 1 | Password fields masked | `ENG-TEST-16-login-accessibility` asserts `input[type="password"]` on `/login`; `E06-S22` on the change-password page | met | — |
| V6.2.7 | 1 | Paste and password managers allowed | Code read: no paste blocking in `OM/core/src/modules/auth/frontend/login.tsx`; no test | to verify | #743 |
| V6.2.8 | 1 | Password checked exactly as typed | bcryptjs 3 ignores bytes beyond 72 (`OM/core/src/modules/auth/services/authService.ts`); the change route trims `currentPassword` (`api/profile/route.ts`) while sign-in does not; platform source, so handled by the app-owned check (#779) or reported upstream | partial | #779 |
| V6.2.9 | 2 | Long passwords accepted | Code read: `buildPasswordSchema` sets no maximum (`passwordPolicy.ts`); untested; bytes beyond 72 are ignored (V6.2.8) | to verify | #743 |
| V6.2.10 | 2 | No forced periodic rotation | Feature absent: no password-expiry field or rule in `OM/core/src/modules/auth/data/entities.ts` or Vereino modules | n/a | — |
| V6.2.11 | 2 | Enforce banned context words | No list to enforce (V6.1.2) | gap | #779 |
| V6.2.12 | 2 | Reject breached passwords | No breached-password check; source (range API or offline list) is an owner decision in #779 | gap | #779 |
| V6.3.1 | 1 | Brute-force controls in place | Platform limits 5/min per IP+e-mail and 20/min per IP, fail-open (`OM/core/src/modules/auth/lib/rateLimitCheck.ts`), plus Vereino's 10 / 15 min per account (#738); counters in Redis on Railway (boot check); `ISSUE-738-sessionless-rate-limits`. Gap: the per-client counters share one key until the proxy depth is set (A-8) | partial | #739 |
| V6.3.2 | 1 | No default accounts | `docs/ops/deploy.md` → *First deploy* sets `OM_INIT_SUPERADMIN_EMAIL`, a generated `OM_INIT_SUPERADMIN_PASSWORD` and own addresses for the two extra accounts `yarn initialize` always creates (`admin` / `employee` at the platform's demo domain `acme.com` otherwise), deletes those two, and runs the *Default account check* (`mercato auth list-users` filtered for `@acme.com` and derived accounts); both checked on a throwaway database (#747). Staging and production not yet checked by the owner (#747) | partial | #747 |
| V6.3.3 | 2 | Multi-factor for access | No second factor yet; ENG-Q-09 re-decided 2026-11-26 (#736): administrators and treasurers use Google sign-in or a password plus an e-mail code, on the core `auth` `mfa_pending` gate through Vereino's login wrapper (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, phase 1) | gap | #736 |
| V6.3.4 | 2 | No undocumented sign-in paths | Paths as V6.1.3; `OM_AUTOLOGIN_*` forbidden in production (`docs/ops/deploy.md`); API-key path and equal strength not reviewed | to verify | #743 |
| V6.4.1 | 1 | Initial secrets random, expiring, single-use | No initial passwords: invitations are 32-byte CSPRNG links stored hashed, 48 h / 60 min (`foundation/services/accounts.ts`, `TEST-F04-create-account`); single use rests on platform reset confirm (code read) | to verify | #743 |
| V6.4.2 | 1 | No hints or secret questions | Feature absent: no hint or security-question field in `auth` entities or Vereino modules | n/a | — |
| V6.4.3 | 2 | Safe forgotten-password reset | Code read: hashed 60-min single-use token, rate-limited, all sessions deleted (`authService.ts`, `OM/core/src/modules/auth/api/reset.ts`); no MFA to bypass; no Vereino test | to verify | #743 |
| V6.4.4 | 2 | Lost-factor recovery proofing | Planned: a club administrator resets another person's factor after verifying them, with a required note in the command log; the operator for the last administrator (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, DD-2F07, phase 1) | n/a | #736 |
| V6.5.1 | 2 | One-time codes single-use | Planned: the e-mail code's challenge marker is deleted on success and after 5 wrong codes (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, DD-2F05) | n/a | #736 |
| V6.5.2 | 2 | Low-entropy lookup secrets hashed | No lookup secrets; the planned e-mail code is stored as HMAC-SHA256 keyed with a 32-byte challenge id (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, DD-2F05) | n/a | — |
| V6.5.3 | 2 | Codes and seeds from CSPRNG | Planned: `crypto.randomInt` for the code, 32 random bytes for the challenge id (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, DD-2F05) | n/a | #736 |
| V6.5.4 | 2 | Minimum code entropy | Planned: 6 digits (about 20 bits), with 5 attempts per challenge and 5 challenges per user per hour (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, DD-2F05) | n/a | #736 |
| V6.5.5 | 2 | Code and TOTP lifetimes | Planned: the e-mail code lives 10 minutes (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, DD-2F05) | n/a | #736 |
| V6.6.1 | 2 | Phone/SMS factor restrictions | Feature absent: no phone or SMS authentication | n/a | — |
| V6.6.2 | 2 | Out-of-band request binding | Planned: the e-mail code is bound to the sign-in that requested it through the challenge id in the provisional token (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`) | n/a | #736 |
| V6.6.3 | 2 | Out-of-band code brute force | Planned: 5 attempts per challenge, 3 resends 60 s apart, 5 challenges per user per hour counted under a lock, per-IP limits on `verify` and `resend` (`.ai/specs/2026-11-26-vereino-staff-second-factor.md`, DD-2F05, DD-2F08) | n/a | #736 |
| V6.8.1 | 2 | No identity spoofing across IdPs | Links found only by (`provider`, `subject`), never by e-mail, no account creation (DD-S02/DD-S03, `foundation/services/identity.ts`); `TEST-S01-google-sign-in` refuses a tenant-B reuse of a subject | met | — |
| V6.8.2 | 2 | Assertion signatures validated | `arctic` decodes the Google id token without a signature check by decision V-S04 (TLS back channel); iss/aud/azp/exp/sub checked in `foundation/lib/identity.ts`, `lib/__tests__/identity.test.ts` | partial | #743 |
| V6.8.3 | 2 | SAML assertion replay | Feature absent: no SAML (enterprise `sso` not installed) | n/a | — |
| V6.8.4 | 2 | IdP authentication strength checked | #736 picked Google as the staff second factor; Google's ID token carries no reliable `amr`, so 2-Step Verification on the Google account cannot be checked — accepted with the owner's option 1, open as Q-2F04 of `.ai/specs/2026-11-26-vereino-staff-second-factor.md` | n/a | #736 |

### V7 Session Management

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V7.1.1 | 2 | Timeouts documented and justified | Platform values recorded (8 h, 30 days with "remember me", no idle timeout) in spike E3 item 5 and ENG-Q-12; no decided, justified limits | partial | #737 |
| V7.1.2 | 2 | Concurrent session policy documented | Not documented and unlimited: every sign-in adds a `sessions` row | gap | #737 |
| V7.1.3 | 2 | Federated session coordination documented | Social spec *Security* says Google sign-in issues the platform's own session; coordination with the Google session (lifetime, termination) not documented | partial | #737 |
| V7.2.1 | 1 | Tokens verified on the backend | `verifyJwt` then a session lookup by `sid` on each request (`OM/core/src/modules/auth/lib/sessionIntegrity.ts`); `TEST-L02` (`packages/app/.ai/qa/tests/people/TEST-L01-account-state-and-actions.spec.ts`) gets 401 once sessions end | met | — |
| V7.2.2 | 1 | Dynamic session tokens | Spike E3 item 4: per-login signed `auth_token` JWT plus opaque `session_token`; no static secret used as a session | met | — |
| V7.2.3 | 1 | Reference token entropy | Code read: `session_token` is 32 `randomBytes`, stored as an HMAC (`OM/core/src/modules/auth/lib/tokenHash.ts`) | to verify | #743 |
| V7.2.4 | 1 | New token on every sign-in | Each sign-in creates a new session and JWT (`login.ts`, `foundation/services/identity.ts`); the browser's previous session row is not revoked | partial | #737 |
| V7.3.1 | 2 | Inactivity timeout | None (spike E3 item 5); S8.5 target ≤ 30 min for staff; ENG-Q-12 open | gap | #737 |
| V7.3.2 | 2 | Absolute session lifetime | 8 h, but 30 days with "remember me" (`REMEMBER_ME_DAYS`); the limit is not decided (ENG-Q-12) | partial | #737 |
| V7.4.1 | 1 | Terminated sessions unusable | Sign-out deletes the session row; JWTs bound to it are refused (`sessionIntegrity.ts`); `E06-S19-member-shell` (back button stays on `/login`), `TEST-L02` (401 after sessions end) | met | — |
| V7.4.2 | 1 | Disabled accounts lose sessions | Blocking or closing an account ends its sessions: `TEST-L02` gets 401 on the old token; user deletion removes sessions (`OM/core/src/modules/auth/commands/users.ts`) | met | — |
| V7.4.3 | 2 | End sessions after factor change | Code read: password change and reset delete all the user's sessions (`commands/users.ts`, `authService.ts`); unlinking a Google identity ends none | partial | #737 |
| V7.4.4 | 2 | Visible sign-out everywhere | Member shell "Sign out" (`packages/ui/src/member/member-shell.tsx`, `E06-S19-member-shell`); back office header `OM/ui/src/backend/ProfileDropdown.tsx` | met | — |
| V7.4.5 | 2 | Admin ends user sessions | An administrator ends one user's sessions only by blocking (`TEST-L02`); no action ends all users' sessions | partial | #737 |
| V7.5.1 | 2 | Re-auth before sensitive account changes | E-mail change via `PUT /api/auth/profile` needs no re-authentication (spike E3 item 5) | gap | #737 |
| V7.5.2 | 2 | Users view and end own sessions | No page lists or ends a user's own sessions | gap | #737 |
| V7.6.1 | 2 | RP/IdP session lifetimes as documented | Google sign-in yields an independent 8 h platform session; no `max_age`/`auth_time` limit on the Google authentication; not documented | partial | #737 |
| V7.6.2 | 2 | Sessions only by explicit user action | Sign-in buttons need a click, but Google `start` is a `GET` any page can trigger (`foundation/api/identity/[provider]/start/route.ts`) and `/api/auth/login` accepts cross-site form posts | partial | #744 |

### V8 Authorization

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V8.1.1 | 1 | Documented function and data access rules | Actor/feature/scope table in `.ai/specs/2026-10-20-vereino-club-management.md` *Users, Permissions, and Scope* (DD-06); feature ids in each `packages/app/src/modules/<id>/acl.ts`; S8.3 | met | — |
| V8.1.2 | 2 | Documented field-level read/write rules | Club spec names some field limits (PESEL only with `people.pesel.view`, treasurer sees name and payer code only, maintenance planner no personal data); no per-field read/write matrix | partial | #743 |
| V8.2.1 | 1 | Functions need explicit permission | Route `metadata` `requireFeatures` (S8.3, feature ids, no role names); e.g. `TEST-S01` 403 without `foundation.identity.self`; gap: no route-by-route insufficient-feature inventory (A-2) | partial | #743 |
| V8.2.2 | 1 | Object-level access, no IDOR | Cross-club: `ISSUE-628-cross-club-isolation` (club B id answers 404); in-club record scope: `people.scopeService`, `TEST-F02-record-scope`; gap: in-club scope tests not inventoried for every module | partial | #743 |
| V8.2.3 | 2 | Field-level access, no BOPLA | PESEL returned only with `people.pesel.view` (`TEST-F06-pesel`), medical date by consent and feature (`TEST-O01-medical-status`); other sensitive fields not inventoried | partial | #743 |
| V8.3.1 | 1 | Server-side enforcement only | Features and scope checked on the server from the authenticated context (S8.3, DD-06); `ISSUE-628-cross-club-isolation` calls every API route directly as each role, bypassing the UI | met | — |
| V8.4.1 | 2 | Cross-tenant isolation | `ISSUE-628-cross-club-isolation` (two clubs, every route, every role) kept complete by `yarn verify` step `route-isolation:check` (`packages/app/scripts/check-route-isolation.mjs`, inventory `packages/app/.ai/qa/tests/_fixtures/isolation/inventory/*.json`) | met | — |

### V9 Self-contained Tokens

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V9.1.1 | 1 | Token signature checked before use | Code read: platform JWT HMAC-SHA256 checked with `timingSafeEqual` before parsing (`OM/shared/src/lib/auth/jwt.ts`); the Google id token is not signature-checked (V-S04, see V6.8.2) | partial | #743 |
| V9.1.2 | 1 | Algorithm allowlist | Code read: `verifyJwt` ignores the `alg` header and always computes HS256 (`jwt.ts`); no test | to verify | #743 |
| V9.1.3 | 1 | Keys from trusted configuration | Signing key only from `JWT_SECRET`, required at boot (`packages/app/scripts/vereino-boot-env.mjs`, `ENG-TEST-12-13-boot-env`); the token header never selects a key (`jwt.ts`) | met | — |
| V9.2.1 | 1 | Validity window enforced | Code read: platform checks `exp` (issues no `nbf`) in `jwt.ts`; Google `exp` checked in `foundation/lib/identity.ts`, unit-tested in `lib/__tests__/identity.test.ts` | to verify | #743 |
| V9.2.2 | 2 | Token type and purpose checked | Code read: staff/customer audiences and `mfa_pending` tokens kept apart (`jwt.ts`); refresh token is opaque; the Google id token is used only to find a link | to verify | #743 |
| V9.2.3 | 2 | Audience checked | Google `aud`/`azp` checked: `TEST-S01-google-sign-in` (`foreign_audience`) and `identity.test.ts`; platform `aud`=`staff` and `iss` check is code read only (`jwt.ts`) | to verify | #743 |
| V9.2.4 | 2 | Audience-restricted shared keys | Code read: platform derives a per-audience HMAC key from `JWT_SECRET` and sets `aud` (`jwt.ts`); Vereino issues no tokens to other services | to verify | #743 |

### V10 OAuth and OIDC

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V10.1.1 | 2 | Tokens kept to components needing them | Google code exchanged server-side; `exchangeCode` in `packages/app/src/modules/foundation/services/identity-providers.ts` keeps only subject and verified e-mail, tokens never reach the browser; `identityEventPayload` unit-tested to drop subject | met | — |
| V10.1.2 | 2 | Accept only own-session flow results | Single-use state marker bound to `HttpOnly` cookie `vereino_identity_state` (`foundation/services/identity.ts`); link purpose re-checks user and scope; `TEST-S01` refuses reused, tampered and cookie-less state | met | — |
| V10.2.1 | 2 | CSRF protection of code flow | PKCE S256 (`authorizationRequest`) plus state bound to cookie; fake provider requires S256 (`packages/app/.ai/qa/tests/foundation/identity/_fixtures/google-fake.ts`); `TEST-S01` | met | — |
| V10.2.2 | 2 | Mix-up defence for several providers | Only Google is enabled (`identityProviderConfig` returns null for Facebook, unit test "ships no Facebook configuration"); per-provider callback path and `markerAccepted` provider check ready for phase 2 | n/a | — |
| V10.3.1 | 2 | Resource server audience check | Vereino is not an OAuth resource server; it accepts no third-party access tokens | n/a | — |
| V10.3.2 | 2 | Resource server delegated-claims checks | Not a resource server | n/a | — |
| V10.3.3 | 2 | Resource server stable user identity | Not a resource server | n/a | — |
| V10.3.4 | 2 | Resource server authentication strength check | Not a resource server | n/a | — |
| V10.4.1 | 1 | AS exact redirect URI allowlist | Vereino is not an authorization server (Google is) | n/a | — |
| V10.4.2 | 1 | AS single-use authorization code | Not an authorization server | n/a | — |
| V10.4.3 | 1 | AS short-lived authorization code | Not an authorization server | n/a | — |
| V10.4.4 | 1 | AS grant restriction per client | Not an authorization server | n/a | — |
| V10.4.5 | 1 | AS refresh token replay defence | Not an authorization server | n/a | — |
| V10.4.6 | 2 | AS requires PKCE | Not an authorization server | n/a | — |
| V10.4.7 | 2 | AS dynamic client registration safety | Not an authorization server | n/a | — |
| V10.4.8 | 2 | AS refresh token absolute expiry | Not an authorization server | n/a | — |
| V10.4.9 | 2 | AS token revocation by user | Not an authorization server | n/a | — |
| V10.4.10 | 2 | AS authenticates confidential clients | Not an authorization server (as a client, Vereino sends its secret on the token request, `arctic` `OAuth2Client`) | n/a | — |
| V10.4.11 | 2 | AS assigns minimal scopes | Not an authorization server (as a client, Vereino asks only `openid email`, `GOOGLE_SCOPES` in `foundation/lib/identity.ts`) | n/a | — |
| V10.5.1 | 2 | ID token replay defence | No `nonce`; the id token is taken only from the back-channel token response to this round trip's code and PKCE verifier, behind a single-use state (`TEST-S01` reused-state case) | met | — |
| V10.5.2 | 2 | User identified by stable subject | Links keyed by (`provider`, `subject`) (`findLinkForSignIn`, D-027); e-mail never identifies; `idTokenIdentity` unit tests in `foundation/lib/__tests__/identity.test.ts` | met | — |
| V10.5.3 | 2 | Reject impersonating provider metadata | No metadata discovery: fixed Google endpoints in `foundation/lib/identity.ts`, `https:` only outside loopback (unit-tested) | n/a | — |
| V10.5.4 | 2 | ID token audience equals client id | `idTokenIdentity` checks `iss`, `aud`, `azp`, `exp`, `sub` (unit tests); `TEST-S01` `foreign_audience` ends without a session | met | — |
| V10.5.5 | 2 | Back-channel logout token safety | No OIDC back-channel logout implemented | n/a | — |
| V10.6.1 | 2 | OP allowed response modes | Vereino is not an OpenID Provider | n/a | — |
| V10.6.2 | 2 | OP forced-logout defence | Not an OpenID Provider | n/a | — |
| V10.7.1 | 2 | AS obtains user consent | Not an authorization server; consent is Google's | n/a | — |
| V10.7.2 | 2 | AS consent screen clarity | Not an authorization server | n/a | — |
| V10.7.3 | 2 | AS consent review and revoke | Not an authorization server (users unlink Google themselves, `TEST-S02-identity-management`) | n/a | — |

### V11 Cryptography

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V11.1.1 | 2 | Key management policy and lifecycle | Pieces only: S8.10 rotation rule, `age` backup key lifecycle in `docs/ops/backups.md`, rotation on incident in `docs/ops/incident.md`; no policy covering all keys | partial | #740 |
| V11.1.2 | 2 | Cryptographic inventory kept current | No written inventory of keys, algorithms and certificates (open item A-3) | gap | #740 |
| V11.2.1 | 2 | Validated crypto implementations | Vereino code uses `node:crypto` only (no hand-written crypto, AGENTS.md); platform uses `node:crypto` and `bcryptjs`; no gate enforces it | to verify | #743 |
| V11.2.2 | 2 | Crypto agility | Platform lookup hash is versioned (`v2` prefix, `@open-mercato/shared/src/lib/encryption/aes.ts`); ciphertext format and re-encryption path not checked | to verify | #740 |
| V11.2.3 | 2 | At least 128-bit security | Seen in source: AES-256-GCM, SHA-256, HMAC-SHA256, 32-byte tokens; JWT signing algorithm and key length not checked | to verify | #743 |
| V11.3.1 | 1 | No ECB or weak padding | No cipher in Vereino code; platform field encryption is `aes-256-gcm` (`packages/app/node_modules/@open-mercato/shared/src/lib/encryption/aes.ts`); not proven by a test | to verify | #743 |
| V11.3.2 | 1 | Approved ciphers and modes only | Platform AES-256-GCM (same file); `TEST-F06-pesel` proves ciphertext at rest, not the mode | to verify | #743 |
| V11.3.3 | 2 | Authenticated encryption | GCM with auth tag in platform `aes.ts`; tamper rejection not tested | to verify | #743 |
| V11.4.1 | 1 | Approved hash functions only | Vereino code uses SHA-256 and HMAC-SHA256 only (no MD5/SHA-1 found by search); no gate enforces it | to verify | #743 |
| V11.4.2 | 2 | Password hashing KDF | Platform `bcryptjs` cost 10 (`packages/app/node_modules/@open-mercato/core/src/modules/auth/services/authService.ts`), the minimum of current guidance; not reviewed | to verify | #743 |
| V11.4.3 | 2 | Collision-resistant integrity hashes | SHA-256 for token hashes and preview tokens (`foundation/lib/token-link.ts`, `people/lib/departure-token.ts`) | to verify | #743 |
| V11.4.4 | 2 | KDF for password-derived keys | Platform derives tenant keys from the fallback secret with PBKDF2-SHA512, 310,000 iterations (`@open-mercato/shared/src/lib/encryption/kms.ts`); key store decision pending | to verify | #740 |
| V11.5.1 | 2 | CSPRNG, 128+ bits for secrets | OAuth state `randomBytes(32)` (`foundation/services/identity.ts`); link tokens via platform `generateAuthToken` (32 random bytes, `foundation/services/token-link.ts`); UUIDs are ids only | to verify | #743 |
| V11.6.1 | 2 | Approved key generation and signatures | Vereino generates no keys; JWT signing (platform), Stripe webhook verification (SDK) and `age` backup keys not reviewed | to verify | #743 |

### V12 Secure Communication

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V12.1.1 | 1 | Only current TLS versions | TLS terminated at Railway's edge (D-039, PR #725 unmerged); protocol versions not measured | to verify | #739 |
| V12.1.2 | 2 | Strong cipher suites preferred | Railway edge; cipher suites not measured | to verify | #739 |
| V12.1.3 | 2 | mTLS client certificate trust | No mTLS client authentication | n/a | — |
| V12.2.1 | 1 | HTTPS everywhere, no fallback | HSTS `max-age=63072000; includeSubDomains` in `packages/app/next.config.ts`, proven by `ENG-TEST-11` (#463); HTTP-to-HTTPS redirect at the Railway edge not checked | partial | #739 |
| V12.2.2 | 1 | Publicly trusted certificates | Designed: Railway-managed public certificates for the app and club subdomains; not checked and not documented in `docs/ops/deploy.md` | to verify | #735 |
| V12.3.1 | 2 | Encrypted inbound and outbound links | Google endpoints `https:` only (`identityProviderConfig`, unit-tested); Stripe, Resend, backup bucket over HTTPS; DB and Redis on Railway private network (WireGuard, D-039) unconfirmed | partial | #735 |
| V12.3.2 | 2 | TLS clients validate certificates | Node default validation; platform DB SSL keeps `rejectUnauthorized` unless `DB_SSL_REJECT_UNAUTHORIZED=false` (`@open-mercato/shared/src/lib/db/ssl.ts`); production variables not checked | to verify | #735 |
| V12.3.3 | 2 | Encrypted internal HTTP traffic | App, worker, PostgreSQL and Redis inside Railway private network (D-039); no internal plain-HTTP service confirmed | to verify | #735 |
| V12.3.4 | 2 | Trusted certificates internally | Internal traffic relies on the WireGuard private network, not internal TLS certificates; to confirm with D-039 | to verify | #735 |

### V13 Configuration

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V13.1.1 | 2 | Outbound communication needs documented | `docs/compliance/processors.md` (Railway, Resend, Stripe, backup, uptime) and `docs/ops/deploy.md` variables; missing: Google sign-in (#566) and one outbound-call inventory | partial | #743 |
| V13.2.1 | 2 | Backend component connections authenticated | PostgreSQL through `DATABASE_URL` credentials, Redis through private-network `REDIS_URL` (`docs/ops/deploy.md`); Redis authentication and no public DB proxy not checked | to verify | #735 |
| V13.2.2 | 2 | Least-privilege service accounts | Spike #448 item 1 decided a non-superuser runtime role plus an owner role for migrations; not built (`scripts/railway-predeploy.sh` migrates with the same `DATABASE_URL`) | gap | #735 |
| V13.2.3 | 2 | No default service credentials | `packages/app/scripts/vereino-boot-env.mjs` requires `JWT_SECRET` in production but accepts the `.env.example` placeholder `change-me-dev-secret`; database credentials generated by Railway, not checked | partial | #735 |
| V13.2.4 | 2 | Allowlist of external systems | Outbound targets are fixed in code or env (Stripe SDK, Resend, Google via `arctic`, heartbeat URLs) but no allowlist enforces them | gap | #735 |
| V13.2.5 | 2 | Server-level egress allowlist | No egress restriction on the Railway services; none documented in `docs/ops/deploy.md` | gap | #735 |
| V13.3.1 | 2 | Secrets in a managed store | Sealed Railway variables (`docs/ops/deploy.md`, D-039 in unmerged PR #725); per-club keys derived from one master secret, no key store yet (`docs/compliance/retention.md`, Q-M07) | partial | #740 |
| V13.3.2 | 2 | Least privilege on secrets | Designed: sealed variables, production access limited to maintainers (S8.10); no token or member inventory collected | to verify | #735 |
| V13.4.1 | 1 | No source-control metadata deployed | `.dockerignore` excludes `.git`; the image is built from `Dockerfile` (`railway.toml` builder `DOCKERFILE`) | met | — |
| V13.4.2 | 2 | Debug modes off in production | Runner stage of `Dockerfile` sets `NODE_ENV=production`; platform dev-runtime routes (`packages/app/src/app/api/dev-runtime/`) answer 404 unless enabled; not checked on a deployed environment | to verify | #735 |
| V13.4.3 | 2 | No directory listings | Next.js serves only routes and `public/`; platform behaviour, not tested | to verify | #743 |
| V13.4.4 | 2 | HTTP TRACE refused | Not checked at the Railway edge or in Next.js | to verify | #739 |
| V13.4.5 | 2 | Docs and monitoring endpoints exposure | `/api/healthz` public by design (S15.4); `packages/app/src/app/api/docs/openapi/route.ts` serves OpenAPI to anonymous callers with no recorded decision | partial | #743 |

### V14 Data Protection

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V14.1.1 | 2 | Sensitive data identified and classified | `docs/compliance/ropa.md` lists categories per table and marks encrypted (ENC) columns; art. 9 data named; no protection levels defined | partial | #743 |
| V14.1.2 | 2 | Protection requirements per level | Rules exist piecemeal: encryption per `<module>/encryption.ts`, retention (`docs/compliance/retention.md`), log ban list (S15.1), minimisation (S9.4); no per-level requirement set | partial | #743 |
| V14.2.1 | 1 | No sensitive data in URLs | S9.4 bans personal data in URLs; personal-link tokens sit in URL paths by design, mitigated with `no-referrer`/`no-store` in `packages/app/next.config.ts` | partial | #743 |
| V14.2.2 | 2 | No sensitive data in server caches | `private, no-store` on authenticated `/api` (`ENG-TEST-11`); contents and purge of the Redis application cache (`CACHE_STRATEGY=redis`) not reviewed | partial | #743 |
| V14.2.3 | 2 | No data sent to trackers | No analytics (S9.9), `newrelic` unconfigured (S15.3); CSP `connect-src 'self' https:` does not enforce it | partial | #743 |
| V14.2.4 | 2 | Protection controls implemented | Column encryption (`packages/app/src/modules/*/encryption.ts`), link-token purge jobs (retention R9); open: accounting sweep (R1) and several retention periods, key store | partial | #740 |
| V14.3.1 | 1 | Client data cleared on logout | Auth cookies are `HttpOnly` (spike #448 item 4); no `Clear-Site-Data`; member context in `sessionStorage` (`packages/ui/src/member/member-context.ts`) outlives sign-out until the tab closes | partial | #737 |
| V14.3.2 | 2 | Anti-caching response headers | `packages/app/next.config.ts` adds `private, no-store` on authenticated `/api` and token pages; `ENG-TEST-11` asserts it; dynamic pages get Next.js `no-store` (spike #448 item 12) | met | — |
| V14.3.3 | 2 | No sensitive data in browser storage | Session tokens only in `HttpOnly` cookies (spike #448 item 4); `sessionStorage` holds a person id and selection; platform `localStorage` use (CrudForm, DataTable) not reviewed | to verify | #743 |

### V15 Secure Coding and Architecture

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V15.1.1 | 1 | Remediation time frames documented | S16.3 of `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`: high/critical runtime advisories in 7 days, exploitable critical in 48 hours; `SECURITY.md` | met | — |
| V15.1.2 | 2 | Component inventory / SBOM | `yarn.lock`, weekly `yarn licenses:check` and `yarn npm audit` (`.github/workflows/security.yml`), Renovate (`renovate.json`); no SBOM produced | partial | #741 |
| V15.1.3 | 2 | Resource-heavy functions documented | S8.6 and the *Sessionless route inventory* (#738) cover public routes only; no list of costly authenticated functions (imports, PDF, exports) | partial | #741 |
| V15.2.1 | 1 | Components within update time frames | Dependabot alerts on (`docs/ops/github-settings.md`), weekly audit job not a required check; current alert state not collected | to verify | #741 |
| V15.2.2 | 2 | Availability defences for heavy functions | Route `metadata.rateLimit` on every sessionless route and sign-in limits (#738); `foundation/services/public-route-load.ts` keeps the limit on server rendering; authenticated heavy functions (imports, PDF, exports) not limited | partial | #741 |
| V15.2.3 | 2 | No extraneous functionality in production | Scaffold modules `example`, `example_customers_sync`, `ratelimit_probe` are unregistered in `src/modules.ts` but shipped as source (`Dockerfile` copies `src`); dev-runtime routes present, gated | partial | #743 |
| V15.3.1 | 1 | Only required fields returned | Minimisation rule S9.4; public pages without personal data (S8.6); no test asserts response field sets | to verify | #743 |
| V15.3.2 | 2 | Outbound calls do not follow redirects | Heartbeat `fetch` in `payments/services/invariants.ts` uses the default (follows redirects); targets are operator-set; Google endpoints fixed in `arctic` | partial | #743 |
| V15.3.3 | 2 | Mass-assignment protection | Zod request schemas and server-derived tenant/organization (AGENTS.md); no test sends an unexpected field | to verify | #743 |
| V15.3.4 | 2 | Trusted client IP through proxies | Platform `getClientIp` honours `RATE_LIMIT_TRUST_PROXY_DEPTH` (default 0 = ignore XFF); `docs/ops/deploy.md` → *Rate limits* documents how to measure it, the production value is not set yet (A-8) | partial | #739 |
| V15.3.5 | 2 | Strict typing and comparisons | TypeScript `strict` and `strictTypeChecked` lint (`eslint.vereino.mjs`, `yarn typecheck`, `yarn lint`); no `eqeqeq` rule | partial | #743 |
| V15.3.6 | 2 | Prototype pollution prevented | No specific control; Zod parsing rebuilds objects with known keys only — not verified | to verify | #743 |
| V15.3.7 | 2 | HTTP parameter pollution | Zod validation of query and body per route; duplicate-parameter handling not tested | to verify | #743 |

### V16 Security Logging and Error Handling

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V16.1.1 | 2 | Logging inventory | `docs/ops/monitoring.md` *Log filters* and S15.1; does not cover `action_logs`, Railway HTTP logs, retention and access in one inventory | partial | #735 |
| V16.2.1 | 2 | Log entries carry who/when/where/what | S15.1 fields (`module`, ids, `tenantId`, `organizationId`), pino `time`; user identity on app log lines not confirmed | to verify | #743 |
| V16.2.2 | 2 | Synchronised time, UTC timestamps | pino `time` in epoch milliseconds (`docs/ops/monitoring.md` example); host clock sync is Railway's, not confirmed | to verify | #743 |
| V16.2.3 | 2 | Logs only to documented sinks | stdout to Railway; `TELEMETRY_BACKEND=console` exports nothing (`docs/ops/monitoring.md`); `newrelic` unconfigured (S15.3); not checked on deployed services | to verify | #735 |
| V16.2.4 | 2 | Common machine-readable log format | Platform logger writes pino JSON (`docs/ops/monitoring.md`); Next.js unhandled-rejection lines are plain text (spike #448 item 12) | partial | #743 |
| V16.2.5 | 2 | Logging respects data sensitivity | S15.1 ban list; `no-console` in Vereino modules (`eslint.vereino.mjs`); URL redaction tested (`packages/app/scripts/__tests__/vereino-ops-signal.test.mjs`); no general check | partial | #743 |
| V16.3.1 | 2 | Authentication attempts logged | Social sign-in failures logged with a fingerprint (`foundation/services/identity.ts`); password sign-in only emits `auth.login.success`/`failed` events, no persistent sink found | partial | #743 |
| V16.3.2 | 2 | Failed authorization logged | 403 and 404 answers; no logging of denials confirmed | to verify | #743 |
| V16.3.3 | 2 | Documented security events logged | No list of security events; rate-limit hits and validation bypass attempts not logged | gap | #743 |
| V16.3.4 | 2 | Unexpected errors logged | API dispatcher calls `reportError` on 5xx (`packages/app/src/app/api/[...slug]/route.ts`); silent unless `TELEMETRY_BACKEND=console` (set by the `docs/ops/monitoring.md` setup, missing from the `deploy.md` variables) | partial | #743 |
| V16.4.1 | 2 | Log injection prevented | pino JSON escaping and constant messages (S15.1); platform behaviour, not tested | to verify | #743 |
| V16.4.2 | 2 | Logs protected from access and change | Railway logs readable by project members only (`docs/ops/monitoring.md`); kept 7 days on Hobby (30 on Pro per unmerged D-039); `action_logs` writable by the app's DB role | partial | #735 |
| V16.4.3 | 2 | Logs shipped to a separate system | No log drain or vendor (`docs/ops/monitoring.md`: "No log drain setting") | gap | #735 |
| V16.5.1 | 2 | Generic error messages | Business errors as codes from `lib/error-codes.ts` (S6.7); unhandled throws re-thrown to Next.js 500 rendering; production body not checked | to verify | #743 |
| V16.5.2 | 2 | Secure behaviour on external failure | Timeouts on health probes (S15.4) and heartbeat pings; `public-route-load.ts` falls back on failure; Stripe/Resend outage paths not tested | to verify | #743 |
| V16.5.3 | 2 | Fail closed on exceptions | Scope fails closed: `ISSUE-628-cross-club-isolation` and `route-isolation:check` (`scripts/verify.mjs`); general exception paths not reviewed | partial | #743 |

### V17 WebRTC

| Req | L | Topic | Vereino control and evidence | State | Owner |
|---|---|---|---|---|---|
| V17.1.1 | 2 | TURN relay address restrictions | No TURN service; Vereino uses no WebRTC | n/a | — |
| V17.2.1 | 2 | DTLS key management | No media server; no WebRTC | n/a | — |
| V17.2.2 | 2 | DTLS cipher suites and SRTP profile | No media server; no WebRTC | n/a | — |
| V17.2.3 | 2 | SRTP authentication checked | No media server; no WebRTC | n/a | — |
| V17.2.4 | 2 | Malformed SRTP resilience | No media server; no WebRTC | n/a | — |
| V17.3.1 | 2 | Signalling flood resilience | No signalling server; no WebRTC | n/a | — |
| V17.3.2 | 2 | Malformed signalling resilience | No signalling server; no WebRTC | n/a | — |
