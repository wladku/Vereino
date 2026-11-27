# Personal invitation link and QR code: staff hand a guardian's pending invitation over in person or on WhatsApp

**Date**: 2026-11-26
**Status**: Ready for implementation — owner decisions on Q-IL01…Q-IL05 of 2026-11-26 (#868 comment 7203995227)

> Related: #868 (this story), epic #865, #869 (E29-S02, group QR code — the second consumer of the QR component), decisions D44 (PR #864, `research/decisions/D-044-reach-guardians-invitation-links-and-club-page.md`), D27 (`D-027-social-sign-in.md`), D29 (phone first). Reused: the people life-cycle spec (`implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md`, REQ-L01, DD-L01, V-L01), the foundation token links (P-10, `foundation/services/token-link.ts`, REQ-F07), the social sign-in spec (`2026-10-27-vereino-social-sign-in.md`, DD-S02). Code read: `people/commands/accounts.ts`, `people/api/persons/[id]/account/invitation/route.ts`, `people/lib/account-limits.ts`, `people/services/account-limits.ts`, `people/components/AccountPanel.tsx`, `people/components/PersonRecord.tsx`, `foundation/services/accounts.ts` (`resendInvitation`, `sendAccountInvitation`), `packages/core/src/account-policy.ts`, `packages/core/src/scope.ts`, `packages/core/src/roles.ts`, `activities/services/guardian-contacts.ts`, the platform page `auth/frontend/reset/[token]`. Identifiers: decisions `IL-D01…`, requirements `REQ-IL01…`, tests `TEST-IL01…`, acceptance `IL-AC-01…`.

## TLDR

A pending account invitation reaches a guardian only by e-mail, and the first prospective club reaches parents in WhatsApp groups and at training (D44, A07). This spec lets the club administrator in the panel, and a coach or coordinator on the phone for the families of their own groups or sections, take a **personal invitation link** for a guardian whose account is still invited, copy it or show it as a **QR code**, and lets the guardian open it on the club's address, see only the club and what to do next, and set the password through the existing activation. A new link replaces the previous one; every link given out is audited and counts against the existing re-send limits. Accounts are still created only by the administrator; the link never creates an account or claims a child (D44).

## Problem Statement

- The administrator creates the guardian's account and Vereino e-mails a 48-hour link; a re-send (`people.persons.resend_invitation`) e-mails a 60-minute link (V-L01 fallback). The raw link never reaches Vereino code, so staff cannot give it to a parent any other way.
- The first prospective club's coach says parents do not read club e-mail and are chased by phone (A01, A07 in the brief refresh of 2026-11-26). The adoption test of A01 is "invite the guardians of one group through the D44 links in their own chat".
- Coaches and coordinators are at the pitch (D29) and have no account tools: only `club_admin` holds `people.accounts.manage`; a coach has no `people.view` at all and sees guardians only in the consented contacts of an occurrence.
- The platform reset page that the e-mailed link opens speaks of a *password reset*, offers "Request a new link" (`/reset`), and shows no club; a parent scanning a QR code at training would not know what it is or whom to ask.

## Overview and Success Measures

- **Primary outcome:** in the A01 test group, the share of guardians with a pending invitation who activate their account within 7 days of the coach sharing links (no threshold set by the owner; measured from `lastLoginAt` against the link audit entries).
- **Leading indicators:** number of links given out per club per week (`people.audit.persons.share_invitation`); share of opened links (start action) that end in an activated account.
- **Baseline:** unknown — the e-mail invitation is the only path; activation within 7 days of the e-mail is measurable from the same audit and account fields.
- **Market / product reference:** Spond, TeamSnap and Heja invite parents through a share link or code a coach sends in a group chat; they create the parent's membership from the link (open join). D44 rejects open join: Vereino keeps the administrator-created account and only changes how the invitation travels. Adopted: share sheet + QR on the coach's phone; rejected: join codes and parent self-registration.

## Goals

- **REQ-IL01** — The administrator, from the person's account tab in the panel, takes an invitation link for a person whose account is invited, copies it, and shows it as a QR code.
- **REQ-IL02** — A coach (for guardians of children in groups they coach) and a coordinator (for guardians of children in sections they coordinate) find the families with a pending invitation on the phone under `/club` and take, copy and show the link the same way; anyone else is refused by the UI and by the API.
- **REQ-IL03** — The guardian opens the link on the club's address, sees only the club and what to do next, and activates the account through the existing password activation; the invitation then counts as used.
- **REQ-IL04** — A used, expired or replaced link shows that the invitation is no longer valid and how to ask the club for a new one, and nothing about any person.
- **REQ-IL05** — Every link given out is recorded in the audit log with the staff member and obeys the existing re-send limits; only the newest link of an account works.
- **REQ-IL06** — The guardian can choose sign-in with Google on the link page and the account is activated without a password (blocked on Q-IL03; phase 3).

## Non-goals

- Self-registration, claiming a child, or creating or linking an account from a link (D44); a group QR code (#869, E29-S02).
- Changing the activation steps themselves (the platform reset page, the Vereino password check of #779) or the e-mail invitation and re-send, which stay as they are.
- Bulk export or printing of links; sending links by SMS or WhatsApp from the server (staff share them with the phone's own share sheet).
- Links for persons other than guardians on the phone (adult participants keep the administrator's panel action).

## Proposed Solution

1. **A Vereino invitation link** (P-10 token link): table `people_invitation_links` (`ScopedEntityBase` + `tokenLinkColumns`, subject `person_id`, `user_id`), use `until_expiry`, TTL 7 days (Q-IL02). Issuing a link revokes the earlier unused links of the same person in the same transaction, so only the newest one works (REQ-IL05). The raw token is returned once to the staff member who asked and never stored, logged or audited.
2. **Staff take a link** — one command `people.persons.share_invitation` behind `POST /api/people/persons/{id}/account/invitation-link`, feature `people.invitations.share` (new; granted to `club_admin`, `coach`, `coordinator`). The command checks: the account is invited (else 409 `invitation_not_pending`); the caller is the administrator, or the person is an active guardian of a child who is a member of a group the coach coaches / of a section the coordinator coordinates (else 404, as an unknown id: D-034). The route runs `limitResend` first, so links and e-mail re-sends share the 3-per-account-in-5-minutes and 20-per-actor-in-an-hour counters. Response `{ url, expiresAt }`; the URL is on the club's address (`clubBaseUrl` of the many-clubs spec), path `/club/i/{token}`.
3. **Families to invite on the phone** — `GET /api/people/invitations/pending` (`people.invitations.share`) lists, in the caller's scope, guardians whose account is invited: guardian display name, children's first names, the group or section that puts them in scope, invited-on date. No e-mail or phone. Page `/club/invitations` (people) with a group (coach) or section (coordinator) filter; each row opens a sheet with **Copy link**, **Share** (Web Share API where present) and the **QR code**; a link to it from the group page `/club/groups/[id]` through an injection spot.
4. **Administrator in the panel** — the existing account tab (`AccountPanel.tsx`) gets **Invitation link** next to **Send the invitation again** for an invited account: the same sheet, same route.
5. **The guardian's page** — `/club/i/[token]` (sessionless, like `/club/d/[token]`): `peek` the token (the one read-only system-scope lookup of the hash, narrowed at once to the found tenant and organization); a valid link shows the club's name and logo, one sentence on what the link is, and **Set your password**; an invalid one shows "This invitation is no longer valid — ask your club for a new link" with the club's name when the club is known, else the product name. Nothing about the guardian or the child is shown in either state. **Set your password** posts the token to `POST /api/people/invitations/{token}/start`, which re-checks the link and the invited state, creates a platform password-setup link bound to the user (the `resendInvitation` path of `foundation/services/accounts.ts`, returning the URL instead of mailing it, Q-IL04) and answers with a redirect to the platform's `/reset/{raw}`. The link is marked used when the account is no longer invited (first sign-in), which the page and the start route check before anything else.
6. **QR code** — rendered in the browser from the URL by a new `QrCode` component in `@vereino/ui` on the `qrcode` package (MIT; `@types/qrcode` is already in `packages/app`; Q-IL01). No third-party QR service; the image never leaves the device.
7. **Google on the link page** (phase 3, blocked on Q-IL03) — **Continue with Google** on `/club/i/[token]` would start the D27 flow in a new `activate` mode bound to the link, link the identity to the invited user and mark the account confirmed, which changes DD-S02 ("linking only from a signed-in session or by the administrator").

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| IL-D01 Vereino token link in front of the platform reset link | lets the page show the club, say "ask your club" when invalid (REQ-IL04), live 7 days for a WhatsApp message, and be replaced by a newer one without touching the platform's rows | return the platform `/reset/{raw}` URL directly (48 h, `sendAccountInvitation` path that ends earlier rows) | no migration and no new system-scope lookup, but the page shows no club, the invalid state says "request a new link" through `/reset` (a self-service password reset, wrong for an invited parent), and it deep-imports `PasswordReset` that `framework-contracts.md` does not list; kept as the fallback of Q-IL04 |
| IL-D02 Links and e-mail re-sends share one rate limit | the story asks to obey the existing re-send limits; one counter stops a coach from minting links faster than e-mails | separate limits | two counters double the reachable rate |
| IL-D03 Coach and coordinator scope through the child's group/section membership and an active guardianship | reuses `scope-service` coach groups and the coordinator section grant (`packages/core/src/scope.ts`) | a per-guardian ACL | new data, no gain |
| IL-D04 Out-of-scope person answers 404 | D-034: a club B id or an id outside the caller's scope answers like an unknown id | 403 | leaks existence |
| IL-D05 Audit the issue, not the copy | the server sees only issuing; copy and QR happen on the device from the same link | client-reported copy events | unverifiable, more noise |
| IL-D06 QR rendered client-side from a small library in `@vereino/ui` | no third-party service (issue note); two consumers (#868, #869) | own QR encoder | Reed–Solomon and masking code to maintain for no gain |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Invited account | `isConfirmed`, no `passwordHash`, no `lastLoginAt` (`account-policy.ts`) | platform `User` | anything else: 409 `invitation_not_pending` when issuing; invalid page when opening |
| Invitation link | one `people_invitation_links` row: person, user, token hash, `expires_at`, `revoked_at` | people | — |
| Valid link | not expired, not revoked, the account still invited, the person not departed or anonymized, the club active | people + platform `User` | invalid page; `start` answers 410 `invitation_link_invalid` |
| Newest only | issuing revokes every earlier unrevoked link of the person in the same transaction | people | — |
| Used | the account is no longer invited (first password set and sign-in); the row's `used_at` is set lazily on the next peek or start | platform `User` | invalid page |
| Share scope | administrator: any person of the club; coach: active guardians of members of coached groups; coordinator: active guardians of members of coordinated sections | groups, people guardianships, role grants | 404 |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator | list nothing new; take a link for any invited person; see the sheet in the panel | own club (trusted `tenantId` + `organizationId` from the session) | `people.accounts.manage` (panel), `people.invitations.share` |
| Coach | list pending families of coached groups; take a link | coach grant `groupId` | `people.invitations.share` |
| Coordinator | list pending families of coordinated sections; take a link | coordinator grant `sectionId` | `people.invitations.share` |
| Guardian (no session) | open the link, start activation | the link's tenant and organization only, found by the token hash | none |
| Anyone else | nothing; the API refuses (403 without the feature, 404 outside scope) | — | — |

Scope of the staff routes comes from `commandContextForRequest` / `trustedScopeOf`. The sessionless page and `start` route use the P-10 `peek`: one read-only, index-backed system-scope lookup of `people_invitation_links.token_hash` in one DI service (`people/services/invitation-links.ts`), narrowed immediately to the found tenant and organization — a new entry in the `AGENTS.md` exception list (Q-IL05).

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Token link storage, peek, revoke | reuse P-10 | `foundation` (`createTokenLinkService`) + `people` table | DI service | the shared primitive for sessionless links |
| Password-setup link | reuse | platform `auth` via `foundation/services/accounts.ts` | foundation public helper | activation steps unchanged |
| Rate limits | reuse | `people/services/account-limits.ts` | function call | same counters |
| Audit | reuse | platform action log through `buildLog` | command log | as `resend_invitation` |
| Coach groups, coordinator sections | reuse | `people/services/scope-service.ts`, groups membership | IDs | existing grants |
| QR rendering | app-own (shared) | `@vereino/ui` `QrCode` | React component | two consumers |
| Club name, logo, address | reuse | `club_core` settings, `clubBaseUrl` | foundation/club_core public helpers | — |

## Architecture and Data Flow

```text
staff (panel / /club/invitations) -> POST /api/people/persons/{id}/account/invitation-link
     -> limitResend -> people.persons.share_invitation -> people_invitation_links (revoke older, insert)
                                                     -> action log people.audit.persons.share_invitation
     <- { url: https://{club}/club/i/{token}, expiresAt } -> copy / share / QrCode (browser)
guardian -> GET /club/i/{token} -> invitationLinks.peek (system-scope hash lookup, narrow) -> club card
         -> POST /api/people/invitations/{token}/start -> re-check -> foundation password-setup link
         <- 303 /reset/{raw} (platform page, unchanged) -> sign-in -> account no longer invited -> link used
```

- **Module boundaries:** everything app-owned lives in `people`, which owns persons, guardianships and the invitation commands; `foundation` gains one exported helper that returns the password-setup URL instead of mailing it.
- **Extension points:** injection spot on `/club/groups/[id]` for the "Invite families" link; the account tab is people's own component.
- **Alternatives considered:** IL-D01 (raw platform link).
- **Compatibility:** `POST /api/people/persons/{id}/account/invitation` and the e-mails are unchanged; all routes, the feature and the table are additive.

## User Journeys

### Journey J-IL01 — Coach shares links at training

1. The coach opens `/club/groups/[id]` and taps **Invite families** (shown only with `people.invitations.share` and at least one pending family), or opens `/club/invitations`.
2. The list shows each guardian with a pending invitation and their children in this group; the coach taps one.
3. The sheet asks the server for a link, then shows the QR code full width, **Copy link** and **Share**. The parent scans it; or the coach shares it in the family's chat.
4. 429: "You have shared too many links — try again in N minutes"; 409: the row disappears with "This parent has already activated the account"; network error: retry button. Re-opening the sheet issues a new link and the old one stops working (the sheet says so).

### Journey J-IL02 — Administrator in the panel

1. On `backend/people/persons/[id]`, account tab, invited account: **Invitation link** opens the same sheet. Same errors as J-IL01.

### Journey J-IL03 — Guardian activates from the link

1. The guardian opens `https://{club}/club/i/{token}`: the club's logo and name, "You have been invited to {club} in Vereino. Set a password to see your family's activities.", **Set your password**.
2. The tap opens the platform reset page with a fresh password-setup link; the guardian sets the password (Vereino password check applies), signs in, and lands in `/club`.
3. Opening the link again, or an older link, shows the invalid state. Phase 3 adds **Continue with Google**.

## UI and Interaction Contracts

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/club/invitations` | list pending families in scope, open the share sheet | `GET /api/people/invitations/pending`, `POST …/invitation-link` | `/club/groups/[id]` roster (groups), `GuardianContacts.tsx` | member shell, Tailwind, `@vereino/ui` list rows | loading, empty ("Every family in your groups has activated an account"), error, 403, success | REQ-IL02 |
| share sheet (`@vereino/ui` `InvitationShareSheet`) | QR, copy, share | `POST …/invitation-link` | `activities` share-text dialog (D09) | dialog/sheet primitive, `QrCode` | issuing, issued, rate-limited, not pending, error | REQ-IL01, REQ-IL02 |
| `backend/people/persons/[id]` account tab | **Invitation link** action | as above | `AccountPanel.tsx` re-send action | existing panel, `Button`, dialog | as above | REQ-IL01 |
| `/club/i/[token]` | club card + **Set your password** | page server peek, `POST /api/people/invitations/{token}/start` | `/club/d/[token]` | public member layout, no navigation | valid, invalid, starting, error | REQ-IL03, REQ-IL04 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Coach | Groups → group → **Invite families** | link on `/club/groups/[id]` | groups → group → invite families → family (3 taps) |
| Coordinator | member menu → **Invitations** | — | menu → invitations → family |
| Administrator | People → person → Account | — | person → account → invitation link |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| `/club/invitations` | explains that only families with a pending invitation appear and that the administrator creates accounts | single column at 375 px | rows are buttons; Enter opens the sheet |
| share sheet | — | QR at least 240 px square, high-contrast quiet zone in both themes (white background around the code even in dark mode) | focus moves to **Copy link**; copy announces "Link copied" via a live region; Escape closes |
| `/club/i/[token]` | invalid state names the club when known and says to ask it for a new link | single column | **Set your password** is the first focusable control |

- **Localization:** `people.invitationLink.*` in `people/i18n/en.json` and `pl.json`; the page renders in the club's language (P-16) when no session exists.
- **Design-system and theming:** semantic tokens only; the QR keeps a white background with dark modules in both themes for scanning.

## Data Models

### `people_invitation_links` (`InvitationLink`)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | UUID | primary key | no | immutable |
| `tenant_id` / `organization_id` | UUID | `(tenant_id, organization_id, person_id)` | no | trusted context only |
| `person_id` | UUID | in the scope index | no | the guardian person (same module) |
| `user_id` | UUID | — | no | platform user id (ID only, no relation) |
| `token_hash` | text, unique | unique index (the peek) | hash only | `hashAuthToken`; raw never stored |
| `expires_at`, `used_at`, `used_count`, `last_used_at` | P-10 `until_expiry` columns | — | no | `used_at` set lazily when the account is no longer invited |
| `revoked_at` | timestamp, nullable | — | no | set when a newer link is issued, the person departs or is anonymized |
| `created_by_user_id` | UUID | — | no | the staff member (also in the audit entry) |
| `created_at`, `updated_at`, `deleted_at` | timestamps | — | no | `purgeDead` deletes rows 30 days after expiry (S9.5) |

One migration in `people` (Ask First: Q-IL05). Departure and anonymization (`people.departure.*`, the life-cycle spec) revoke the person's links; club deletion drops them with the tenant.

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `POST` | `/api/people/persons/{id}/account/invitation-link` → `people.persons.share_invitation` | auth + `people.invitations.share`; custom guarded command route | path `id` | 200 `{ url, expiresAt }`, response `Cache-Control: no-store` | 401, 403, 404 (`account_not_found`, out of scope), 409 `invitation_not_pending`, 429 `rate_limited` + `Retry-After` | REQ-IL01, 02, 05 |
| `GET` | `/api/people/invitations/pending` | auth + `people.invitations.share` | `groupId?`, `sectionId?`, `page`, `pageSize` | `{ items: [{ personId, displayName, children: [{ firstName, groupName }], invitedAt }], total, page, pageSize, totalPages }` | 401, 403; ids outside scope yield an empty list | REQ-IL02 |
| `POST` | `/api/people/invitations/{token}/start` | none (sessionless); IP + token rate limit | path `token` | 303 to `/reset/{raw}` on `APP_URL` | 410 `invitation_link_invalid` (one code for every invalid cause), 429 | REQ-IL03, 04 |

Error codes go to `people/lib/error-codes.ts` (S6.7). Each route gets per-method `metadata` and `openApi`, and isolation probes in `_fixtures/isolation/inventory/people.json` (`foreign-id` for the share route, `read` for the list, `public` for `start`). Issuing is not idempotent by design (each call replaces the link); `start` may be called repeatedly while the link is valid, each call ending the earlier password-setup links of the user.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `people.persons.share_invitation` | people | action log | `people.audit.persons.share_invitation`, related `auth.user`, context `{ actingRole, expiresAt }` (no token) | not undoable (like `resend_invitation`) |
| person departs / is anonymized | people | invitation links | revoke | in the same transaction |
| `purgeDead` sweep | foundation club jobs | people links | delete dead rows | idempotent |

No notification or e-mail is sent; the start route sends nothing either.

## Security, Privacy, and Compliance

- **Authorization:** feature gate plus the record-level share scope; never role names. The panel action additionally requires `people.accounts.manage` + full access, as the re-send.
- **Tenant isolation:** staff routes take scope from the session; the peek narrows to the link's tenant and organization before any other read; a club B id answers 404.
- **Sensitive data:** the raw token appears only in the issue response and in the guardian's URL; never logged, audited or stored. The page shows no personal data (REQ-IL04, story AC5). The pending list shows names only, no contact data.
- **Abuse and failure modes:** anyone holding a valid link can activate that account — the same holds for the e-mailed link; mitigations: only invited accounts, newest link only, 7-day expiry, audit with the staff member, re-send limits, the sheet warns "share it only with this parent". Token enumeration: 256-bit tokens, rate-limited `start`, one error code for every invalid cause. A coach cannot take over an activated account (409). Link previews in chat apps fetch the page with GET only; GET spends nothing.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-IL01 | integration | club, admin, guardian with invited account | admin takes a link in the panel, opens it, sets the password | sheet shows QR and copies the URL; page shows only the club; password set; link then invalid; audit entry with the admin | REQ-IL01, 03, 05 |
| TEST-IL02 | integration (375 px) | coach of group G, child in G with invited guardian; coordinator of the section | coach and coordinator open `/club/invitations`, take a link | list shows the family; sheet works; API 200 | REQ-IL02 |
| TEST-IL03 | security | coach of another group; member without the feature; club B | list and take a link | family absent; 404 out of scope; 403 without feature; isolation probes | REQ-IL02 |
| TEST-IL04 | integration | links: replaced, expired (clock), used, departed person | open each, call `start` | invalid page with club name, no person data; 410 | REQ-IL04, 05 |
| TEST-IL05 | integration | rate limit on (`x-om-test-rate-limit`) | 2 e-mail re-sends + 2 links | the 4th call is 429; shared counter | REQ-IL05 |
| TEST-IL06 | integration | as TEST-IL01, Google mock provider | **Continue with Google** on the link page | account active without password, identity linked, link used | REQ-IL06 (phase 3) |

Unit tests (100 % coverage): the share-scope and link-validity functions in `people/lib/invitation-links.ts`, the `QrCode` component props-to-matrix wrapper in `@vereino/ui`.

## Implementation Phases

### Phase 1 — Administrator link, guardian page, activation

- **Depends on:** answers to Q-IL01, Q-IL02, Q-IL04, Q-IL05
- **Outcome:** the administrator copies or shows a link; the guardian activates from it.
- **Why this order / value delivered:** the token, page and activation are the core every later surface reuses; the administrator can already run the A01 test alone.
- **Deliverables:** `people_invitation_links` entity + migration; `people/services/invitation-links.ts`; `people.persons.share_invitation`; the share and start routes; foundation helper returning the password-setup URL; `/club/i/[token]`; `QrCode` + `InvitationShareSheet` in `@vereino/ui`; account-tab action; `qrcode` dependency; `AGENTS.md` exception entry; isolation inventory; i18n.
- **Independent slices / estimated commits:** (a) data + service + command + routes; (b) `@vereino/ui` components; (c) page and panel action — about 5 commits.
- **Requirements closed:** REQ-IL01, REQ-IL03, REQ-IL04, REQ-IL05
- **Tests:** TEST-IL01, TEST-IL04, TEST-IL05, isolation probes
- **Validation:** `yarn db:generate` (reviewed, applied only after approval), `yarn generate`, `yarn verify`, `yarn test:integration:vereino --filter TEST-IL01` (one id per run, also IL04, IL05)
- **Exit gate:** TEST-IL01/04/05 green; page checked at 375 px, both locales, light and dark, QR scanned from a phone.

### Phase 2 — Coach and coordinator on the phone

- **Depends on:** Phase 1 exit gate
- **Outcome:** coaches and coordinators share links for their families from `/club`.
- **Why this order / value delivered:** D29 — the people who meet parents get the tool.
- **Deliverables:** `people.invitations.share` granted to coach and coordinator (role defaults + setup sync); share-scope check in the command; `GET /api/people/invitations/pending`; `/club/invitations`; injection on `/club/groups/[id]`; menu entry for coordinators.
- **Independent slices / estimated commits:** (a) scope + list route; (b) page + injection — about 3 commits.
- **Requirements closed:** REQ-IL02
- **Tests:** TEST-IL02, TEST-IL03
- **Validation:** `yarn generate`, `yarn verify`, `yarn test:integration:vereino --filter TEST-IL02`, then `TEST-IL03`
- **Exit gate:** both green; 375 px, both locales, light and dark.

### Phase 3 — Activate with Google from the link

- **Depends on:** Phase 1 exit gate and Q-IL03
- **Outcome:** **Continue with Google** activates the invited account.
- **Why this order / value delivered:** changes D27/DD-S02; built only if the owner approves it.
- **Deliverables:** `activate` mode in `foundation/api/identity/[provider]/start` bound to a valid link; callback links the identity, confirms the account, marks the link used; social sign-in spec changelog entry.
- **Independent slices / estimated commits:** 2 commits.
- **Requirements closed:** REQ-IL06
- **Tests:** TEST-IL06
- **Validation:** `yarn verify`, `yarn test:integration:vereino --filter TEST-IL06`
- **Exit gate:** TEST-IL06 green; DD-S02 amended.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-IL01 | J-IL02, account tab | share route, command | 1 | TEST-IL01 | IL-AC-01 |
| REQ-IL02 | J-IL01, `/club/invitations` | list route, share scope | 2 | TEST-IL02, TEST-IL03 | IL-AC-02, IL-AC-03 |
| REQ-IL03 | J-IL03, `/club/i/[token]` | start route, foundation helper | 1 | TEST-IL01 | IL-AC-04 |
| REQ-IL04 | `/club/i/[token]` invalid | peek, 410 | 1 | TEST-IL04 | IL-AC-05 |
| REQ-IL05 | all | revoke-on-issue, `limitResend`, audit | 1 | TEST-IL01, TEST-IL05 | IL-AC-06 |
| REQ-IL06 | J-IL03 step 3 | identity `activate` mode | 3 | TEST-IL06 | IL-AC-07 |

## Rollout, Migration, and Rollback

One additive migration (`people_invitation_links`), generated and reviewed in phase 1, applied only after the owner approves it. The feature is granted through role defaults; rollback removes the grant (UI disappears, routes answer 403) and leaves the table unused; dropping it is a later migration. Existing e-mail invitations are untouched throughout.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| A staff member activates a guardian's account themselves | account held by the wrong person | only invited accounts; audit names the staff member; the guardian's e-mail can still reset the password; administrator can block | accepted, same as the e-mailed link forwarded |
| Link forwarded in a group chat to the wrong family | wrong person activates | personal sheet warning; 7-day expiry; newest-only; audit | low |
| Coach sees names of families of their group | privacy | names and children's first names only, no contact data, scope-limited | accepted (the coach knows the families) |
| Chat-app link preview spends the link | parent finds it dead | GET never spends; the page shows no personal data | none |
| `qrcode` package abandoned | maintenance | small, stable, MIT; wrapped in one `@vereino/ui` component | low |

## Acceptance Criteria

- [ ] **IL-AC-01** — The administrator copies the link of an invited person and shows it as a QR code from the panel.
- [ ] **IL-AC-02** — A coach of the child's group and a coordinator of its section do the same on `/club` at 375 px.
- [ ] **IL-AC-03** — A coach without the child's group sees no such family and the API answers 404; a club B id answers 404.
- [ ] **IL-AC-04** — Following a valid link runs the existing activation; afterwards the link is no longer valid.
- [ ] **IL-AC-05** — A used, expired or replaced link shows the invalid state with how to ask the club, and no personal data; a valid link shows only the club and the next step.
- [ ] **IL-AC-06** — Each link given out is in the audit log with the staff member; links and e-mail re-sends share the limits; only the newest link works.
- [ ] **IL-AC-07** — (phase 3) Continue with Google activates the invited account from the link.
- [ ] Every listed surface uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and `yarn verify` passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `.ai/guides/spec-delivery.md`, om-spec-writing |
| Data models, APIs, events, UI, and tests are internally consistent | pass | traceability table |
| Every workflow completes end to end without a catch-all integration phase | pass | phases 1–3 |
| Platform-native reuse and extension points were chosen before custom code | pass | reuse map (P-10, foundation accounts, limits, action log) |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI contracts table |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | phases |

Verdict: `Ready for implementation` for phases 1–2 (Q-IL01, Q-IL02, Q-IL04, Q-IL05 approved 2026-11-26); phase 3 waits for a separate decision on Q-IL03.

## Open Questions

Answered by the owner on 2026-11-26 (#868 comment 7203995227; all recommendations accepted). Anything beyond these answers (another table, column, module or dependency) is Ask First again.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-IL01 | May `@vereino/ui` add the `qrcode` package (MIT, ~40 kB, types already present) for client-side QR rendering, reused by #869? Alternative: an app-owned encoder. | Władek Kuć | phase 1 | 2026-11-26 — approved: add `qrcode` (MIT) to `@vereino/ui` for `QrCode`; #869 reuses it; this one dependency only |
| Q-IL02 | How long does a shared link live? Options: 48 h (as the e-mail), 7 days, 14 days. | Władek Kuć | phase 1 | 2026-11-26 — 7 days; a new link replaces the older one |
| Q-IL03 | May the link activate an invited account through Google without a password (a change to D27 / DD-S02, which allow linking only from a signed-in session or by the administrator)? If no, the guardian sets a password and can connect Google later from `/club/profile`, which is today's behaviour. | Władek Kuć | phase 3 | 2026-11-26 — not in this story; a separate decision before phase 3 |
| Q-IL04 | Which link do staff share: a Vereino token link on the club's address (IL-D01: club card, "ask your club" when invalid, 7-day life, needs the migration and the lookup of Q-IL05) or the platform's own `/reset/{raw}` password-setup link (48 h, no migration, no new lookup, but no club on the page and an invalid state that offers a self-service reset)? | Władek Kuć | phase 1 | 2026-11-26 — the Vereino token link (P-10, hash only) that shows the club and then hands over to the platform's password setup |
| Q-IL05 | Approve the migration `people_invitation_links` and its sessionless lookup of `token_hash` in `people/services/invitation-links.ts` as a new entry of the `AGENTS.md` system-scope exception list, and the new routes and feature `people.invitations.share` (granted to coach and coordinator)? | Władek Kuć | phases 1, 2 | 2026-11-26 — approved: the migration, the system-scope exception (recorded in `AGENTS.md` like D-024/D-027), both staff routes, and `people.invitations.share` for coach and coordinator scoped to their own groups and sections |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-26-vereino-invitation-link-and-qr/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row). Never add rows to this section.
