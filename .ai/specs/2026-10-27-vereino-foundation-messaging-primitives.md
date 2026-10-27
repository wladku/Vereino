# Vereino foundation III — audience, dispatch and messaging primitives, with E04 (#23) as the consumer

**Date**: 2026-10-27
**Status**: Draft (design complete and reviewed; the gate is closed — Q14 = C, Q15 = B; waiting for the owner's approval on the PR and for enabling the e-mail modules, Ask First)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: issue #23 (E04 — Communication) and its stories #35 (announcements with notification, e-mail and share text) and #36 (cases); `.ai/specs/backlog.md`; `.ai/specs/product-brief.md` (D09, N02, N03, R01, R09, R15, A07, D21); `.ai/specs/2026-10-20-vereino-club-management.md` (phase 3: REQ-009, REQ-010, REQ-017, DD-16, DD-17, DD-35, J-003, the `communication` data model and API rows, TEST-015…017, V-4); the e-mail consumers of `.ai/specs/2026-10-27-vereino-club-payments.md` and `.ai/specs/2026-10-27-vereino-facilities.md`; foundation I (`2026-10-27-vereino-foundation-primitives.md`: P-01…P-19, `authorizeScoped`, `scopeWhere`, phase C token links) and foundation II (`2026-10-27-vereino-foundation-scheduling-primitives.md`: P-12, P-27, P-28) as amended by PRs #43 and #44; the architectural review of 2026-10-26 (`.ai/runs/2026-10-26-spec-architectural-review.md`: the Critical link-token e-mail finding and the High "`communication` as an e-mail hub with a dependency cycle" finding); the installed `@open-mercato/*` 0.9.0 packages (V-M01…V-M05).

## TLDR

E04 is the first phase where the club *talks* to people: an announcement to a club, section, group or session reaches ~200 guardians, participants and coaches by in-app notification and e-mail in each recipient's language, the author gets a one-line text with a link for the group chat, and a thread can be sealed as a case. The same mechanics recur in every later phase — a session cancellation, a declaration reminder with a personal link, a payment confirmation or overdue reminder, an order copy, a rental request verification — often to people without an account. The installed platform covers in-app notifications but not the rest: `messages` takes users only (≤ 100 per message) and renders e-mail in the default locale, the notification e-mail strategy swallows failures and ignores the recipient's language, and no provider reports bounces (V-M01…V-M04). This spec designs three primitives every module will call — **audience** (who receives), **dispatch** (an outbox that delivers on two channels with a per-recipient status and keeps link secrets out of events) and **e-mail templates** (one localized shell) — plus two admin components, and the phase 3 `communication` module that consumes them: scoped threads on append-only messages, announcements, the session-cancellation thread, the share text with a public session page, the member inbox, and cases.

## Problem Statement

Phase 3 makes the app the club's channel of record (D09, H7): a match moved from 10:00 to 11:00 the day before still went through WhatsApp in another club because "nobody will see it" in the app (`[INTERVIEW]` a guardian from another club, 2026-10-23), and the club keeps no record of difficult cases (`[DOCUMENT]` meeting 2026-09-26). Whether in-app notifications and e-mail reach guardians is A07, accepted untested (D21) — so e-mail must actually arrive, in the recipient's language, with a visible "not delivered" when it does not.

The club spec planned the content in `messages` and the e-mail distribution in `communication` (DD-16), subject to V-4. V-4 is negative (V-M01): the installed store addresses users only, 100 at a time, renders e-mail in the platform's default locale, never retries, and lets the sender delete a message for everyone — incompatible with ~200 mixed recipients and with cases. The architectural review of 2026-10-26 adds two structural defects: an e-mail carrying a personal link needs the raw token, which an ids-only event payload (S4.6) cannot carry (Critical), and `communication` as the e-mail hub for `activities`, `payments` and `facilities` creates a dependency cycle (`communication` needs `activities` for scope, `activities` needs `communication` to send) (High). Phases 4 and 5 add at least eight more e-mails, most to addresses without an account. Without a shared foundation each module would build its own fan-out, retry, locale and status handling.

## Overview and Success Measures

- **Primary outcome:** J-003 steps 1, 2, 4 and 5 pass (step 3's link form is REQ-017's) with every e-mail produced by `dispatch` (P-30) — recipients per the rule, both channels, the recipient's language, "not delivered" after a failed send — and the phase 3 exit gate of the club spec passes (e-mails in the test mailbox in the recipient's language; pages in both modes at 375 px; en + pl catalogs complete).
- **Leading indicators:** #35's PR uses P-29, P-30, P-31 and P-32 and contains no `sendEmail` call and no recipient query of its own; the first phase 4 or 5 e-mail added later is one template plus one `dispatch.enqueue` call (the "second consumer adds no API change" indicator of foundation I).
- **Baseline:** no Vereino module exists; the platform's e-mail path (`communication_channels`) and `messages` are not enabled; the guardian's current source is the Messenger channel history (brief, *Problems*).
- **Market / product reference (verified 2026-10-27):** the installed `notifications` (types with channels, `nonOptOut`, preferences, `createBatch` ≤ 1000, `groupKey`) — *adopted* for in-app delivery only; the installed `messages` — *rejected* as the store (V-M01), enabled only because `communication_channels` extends it; the installed bulk outbox of `example/lib/todoBulkComplete.ts` (idempotency key, lease, republish, checkpoint) — *adopted* as the dispatch pattern; the `forms` append-only revision chain — *adopted* as the message history model (edits are new rows); Discourse/Mattermost per-user read markers (`last_read_at` per topic) — *adopted* for unread counts; listmonk's per-subscriber delivery status — *adopted* in the reduced form "sent / failed / skipped" (no opens, no clicks — N-goals of the club spec: no read receipts). *Rejected:* provider bounce webhooks in 1.0 (Q7); a generic "seal" primitive (Q9); one global recipients table per module.

## Goals

- **REQ-M01** (Must) — An audience is declared as data (`club`, `section`, `group`, `activity`, `occurrence` or explicit persons) and resolved at send time, through one provider per scope kind registered by the module that owns the kind, into deduplicated recipients per the club spec's *Thread* rule: members with an account, the active guardians of minor members (a minor without an account is reached only through them), coaches; account holders on in-app and e-mail, people without an account on e-mail only, people with neither marked unreachable, each with a locale (person → club default).
- **REQ-M02** (Must) — Every outbound message of a Vereino module goes through one dispatch service: the caller writes the dispatch and its per-recipient deliveries in its own command transaction (idempotent by a key), delivery happens after commit, at least once, with durable retries independent of the queue strategy and a send rate below the provider limit (S12.4), each delivery ends `sent`, `failed` or `skipped` with a coded reason, and a final failure emits an ids-only event.
- **REQ-M03** (Must) — A per-recipient secret (a raw link token) travels only inside its encrypted delivery row, is used once to render the e-mail and is wiped afterwards; no secret ever appears in an event payload, a log line or a job payload (S4.6; the review's Critical finding).
- **REQ-M04** (Must) — E-mails are declared once as templates with typed parameters and an opt-out class (`never` / `preferences`), rendered per recipient in their locale inside one shared `EmailLayout`; club-entered text is inserted as written and escaped (R09); the platform's own notification e-mail channel is never used for Vereino types, so no message is e-mailed twice.
- **REQ-M05** (Must) — Admin pages reuse two shared components: `AudiencePicker` (a scope the author's grants allow, with a live recipient count) and `DeliveryStatusList` (per-recipient channel status with "not delivered").
- **REQ-M06** (Must) — A coordinator or coach posts an announcement to a scope their grants cover (club spec REQ-009): a thread with an encrypted subject and append-only messages, recipients from REQ-M01, delivery through REQ-M02, the author's acting role recorded; a member's reply reaches the thread's staff only and is shown to staff and to the replier's household (R15 — other families' names are never shown to members); a coach posting outside their groups gets 403.
- **REQ-M07** (Must) — Cancelling a session creates or extends the session thread and e-mails the session audience once per cancellation (J-003 step 1); the in-app notification stays the phase 2 one.
- **REQ-M08** (Must) — The author copies a share text: for a session, a link to a public session page that shows only the activity name, date, time and status (DD-17; the page offers sign-in, and the "send me a link" form arrives with REQ-017); for any other thread, a link to the thread that requires sign-in.
- **REQ-M09** (Must) — A thread marked as a case accepts no edit, deletion or unmarking (409 `case_immutable`), keeps its full history, and is visible to its participants, the coordinator of its section and the administrator (club spec REQ-010).
- **REQ-M10** (Must) — Members read and reply in `/club/messages` with per-thread unread state and an unread count on the "Messages" tile.
- **REQ-M11** (Must) — The club spec's phase 3 is marked `Ready for implementation` for REQ-009 and REQ-010 in the same PR: V-4 recorded, DD-16 resolved by its fallback, the `communication` rows pointing at this spec, the e-mail-hub wording replaced by `dispatch`, and the review's Critical and High phase 3 findings answered; the payments and facilities specs send their e-mails through `dispatch` from their own subscribers and commands; REQ-017 stays with foundation I phase C.

## Non-goals

- Re-documenting or wrapping the platform: `notificationService`, notification preferences, `sendEmail` and its transport, the queue, `ProgressService`, i18n loading — used as they are.
- Opens, clicks and read receipts (club spec non-goal "read receipts"). Bounce and complaint webhooks with suppression (S12.5) and `List-Unsubscribe` (S12.3): amended out of 1.0 (Q14 = C, DD-M17) until the upstream `sendEmail` change ships; an e-mail opt-out mechanism (Q15 = B: designed with the first `preferences` template, REQ-017 reminders).
- Push notifications (N02) and Messenger/WhatsApp integration (N03): the share text replaces it.
- Personal declaration links, the link request form and reminders (REQ-017, Should): foundation I phase C with its own story; this spec only guarantees that `dispatch` carries their tokens safely (REQ-M03).
- Attachments in threads (club spec non-goal), translation of club content (R09), message templates for authors, scheduled announcements.
- A generic "seal" primitive (Q9) and a shared public-reference primitive (Q10): both stay module-local until a second in-scope consumer exists.
- Retention and erasure of dispatch rows, thread messages and cases beyond what REQ-M03 wipes: left to the owner's GDPR decision on the foundation specs (append-only logs, club spec Q-019).
- Anything held back by A02 or A05: the phase 4 and 5 e-mails are named as consumers, not designed.

## Proposed Solution

Three primitives and two components, then the module that proves them.

1. **Audience (P-29).** `AudienceSpec` and the expansion rules are pure types and functions in `@vereino/core`. `resolveAudience(spec, ctx)` in `foundation/services` asks the provider registered for the spec's kind (`vereino.audience.<kind>` — `people` registers `club` and `persons`, `groups` registers `section` and `group`, `activities` registers `activity` and `occurrence`) for the *members* (person ids with a reason), then the contact resolver `vereino.contactResolver` (registered by `people`) for minors' guardians, accounts, addresses and locales, and applies the rules in core. An absent provider fails closed (422 `audience_kind_unavailable`).
2. **Dispatch (P-30).** `dispatch.enqueue(em, request)` writes a `foundation_dispatches` row and one `foundation_deliveries` row per recipient and channel inside the caller's command transaction; the caller calls `dispatch.publish(id)` from its post-commit side effects; the worker `foundation:dispatch-deliver` sends in-app once per dispatch through `notificationService.createBatch` (`channels: ['in_app']` on every call, `groupKey` = the dispatch id, so a retry refreshes instead of duplicating) and e-mail per delivery through the `foundation.emailSender` seam over `sendEmail` with a P-31 template, at most 8 sends per second (S12.4); the lease, the attempts and the next attempt time live on the delivery row, so a sweeper (`foundation:dispatch-sweep`, every 2 minutes, registered with P-12) republishes stalled work under both queue strategies; delivery is at least once. Secrets ride in an encrypted column of the delivery row and are wiped after use. The final state of each delivery is the status the UI shows.
3. **E-mail templates (P-31).** A module declares `defineEmailTemplate({ id, notificationType, optOut, params: ZodSchema, subject(t, p), body(t, p) })` and registers it; the worker renders the subject and the React body with the recipient's dictionary (foundation I P-16) inside `EmailLayout` from `@vereino/ui` (club name, footer with the reason for the e-mail and, for `preferences` templates, the preferences link).
4. **Components (P-32).** `AudiencePicker` (a `CrudForm` custom field) and `DeliveryStatusList` (a `DataTable`) in `@vereino/ui`; each consumer supplies its own preview and delivery routes.
5. **`communication` (the consumer).** Own tables (Q2 = A): threads with an encrypted subject, append-only thread messages on foundation II's `AppendOnlyEntityBase` (P-28 — its second consumer) where an edit is a revision row and a deletion a tombstone row, participants, and read markers. Announcements, replies, the session-cancellation subscriber, cases, the share text and the member inbox are module logic; every `communication` command is non-undoable (a sent e-mail cannot be recalled and append-only rows are never removed). `activities` serves the DD-17 public session page and owns the share-text builder (Q10).

This is the smallest platform-native solution: in-app delivery, e-mail transport, queue, encryption and i18n are the platform's; Vereino adds only what V-M01…V-M04 show missing — recipient expansion, per-recipient status and retry, per-recipient locale, secrets kept out of events — once, in `foundation`, instead of in every module.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-M01** Thread content lives in own `communication` tables; `messages` is not used for content (Q2 = A; club spec DD-16's fallback) | V-M01: users only, ≤ 100 recipients, default-locale e-mail, no retry, sender deletes for everyone (breaks cases) | `messages` as the store, batched by 100, with our delivery rows beside it | Every limitation would need a workaround, and case immutability cannot be guaranteed while `delete_for_actor` exists |
| **DD-M02** Delivery is a `foundation` primitive with its own tables (`foundation_dispatches`, `foundation_deliveries`); `communication` owns threads and cases only (Q3 = A) | Phases 3–5 have ≥ 8 e-mails from four modules; a hub in `communication` makes `activities` depend on `communication` while `communication` depends on `activities` for scope (review High) | `communication` as the hub (club spec) | The cycle; and `facilities` / `payments` would require `communication` to send a confirmation |
| **DD-M03** The outbox follows the installed bulk-outbox pattern: rows written in the caller's transaction with `next_attempt_at = now()`, a publish after commit, a per-delivery lease (`lease_owner`, `lease_expires_at`) and a sweeper; `attempts` is incremented when the lease is taken, so a delivery that crashes the worker every time ends `failed` after 5 attempts (backoff 1, 5, 15, 60 min); delivery is **at least once** — a crash between the send and the status write resends once after the lease expires | The local queue strategy keeps no failed jobs and retries nothing ("no-loss workflows must write their own durable record before enqueueing", V-M05); the row is that record | Rely on the async strategy's 3 retries | The local strategy (dev, tests, small deployments) would lose failures silently |
| **DD-M04** Secrets (`secret_params`) are an encrypted column of the delivery row, read once by the worker, wiped (`null`) when the delivery reaches a final state; job payloads and events carry `deliveryId` only | S4.6 and the review's Critical finding: the raw token must reach the e-mail without passing through an event | Put the token in the event; regenerate the token in the worker | The first breaks S4.6; the second makes the issuing command unable to know the token it issued (it stores only the hash) |
| **DD-M05** Audience providers per scope kind under tokens `vereino.audience.<kind>` plus one `vereino.contactResolver`, resolved with `hasRegistration`; the expansion rules are pure in core (Q5 = A) | The owner of the data answers "who belongs here"; `people` alone knows guardians, accounts, addresses and locales; core keeps the rules testable | One resolver in `communication` calling module services | Recreates the cycle and puts membership logic outside its owner |
| **DD-M06** Recipients follow the club spec's *Thread* rule — members with an account, the guardians of minor members, coaches; a minor with an account receives as a member **and** their guardians receive too; a minor without an account is reached only through the guardians. Channels: an account → in-app + e-mail; no account but an address → e-mail only (Q6 = A); neither → `skipped` (`unreachable`); duplicates collapse per person and channel; a person reached as a member and as a guardian gets one delivery listing both reasons | TEST-015 has guardians with and without accounts; one person, one message (R01) | Account holders only | A guardian without an account would learn about a cancellation from the chat only |
| **DD-M07** In-app delivery uses `notificationService.createBatch` with types declared `channels: ['in_app']` **and** `channels: ['in_app']` passed on every call (an operator override in `notification_type_override` intersects with it, `shouldDeliver.ts:42`), one call per dispatch with `groupKey` = the dispatch id; in-app notifications carry ids and generic keys only, never the subject or text (the `notifications` tables are not encrypted); e-mail is sent only by `dispatch` | V-M04: the platform's e-mail strategy swallows failures and renders the default locale; two e-mail paths would double-send | The platform e-mail channel | No status, wrong language, duplicates |
| **DD-M08** Opt-out (Q8 = A, Q15 = B): a template declares `optOut: 'never'` or `'preferences'`; every phase 3 template is `'never'` (announcement, member reply to staff, session cancellation; the in-app types are `nonOptOut`); the first `'preferences'` template (REQ-017 reminders) brings its opt-out mechanism, because the platform preferences cannot carry it — a type declared `channels: ['in_app']` locks its e-mail cell, and people without an account have no preferences; until then `dispatch` refuses a `'preferences'` template with 500 fingerprint `foundation.dispatch.optout_unavailable` | The guardian mutes messenger apps (brief); e-mail is the channel that must arrive; reminders are noise for some | All by preferences; nothing optional | A muted cancellation; reminder fatigue (the other club's app had 135 unread notifications) |
| **DD-M09** "Not delivered" = the send failed: a permanent error at once, a transient one after the last attempt — classified with the installed `communication_channels/lib/error-classification.ts`, not by Vereino; `failure_code` ∈ `transport_unavailable`, `provider_rejected`, `address_invalid`, `render_failed`; the provider's error text is never stored (it may echo the address); when e-mail delivery is disabled (`OM_DISABLE_EMAIL_DELIVERY`) a delivery is `skipped` / `delivery_disabled`, never `sent` (Q7 = A, Q14 = C) | V-M03: providers are outbound-only and `sendEmail` returns no message id | Own classification; marking `sent` when nothing left | Duplicates the platform; a silent failure |
| **DD-M10** Thread messages are append-only on `AppendOnlyEntityBase` (P-28): an edit is a new `revision` row that supersedes the previous one, a deletion a `tombstone` row; the thread shows the latest revision and "edited" / "deleted" | The full history of a case exists by construction; no UPDATE or DELETE ever touches a message (foundation II named phase 3 cases as P-28's second consumer) | Mutable rows with an audit trail | `action_logs` are undoable, so not evidence (V-M05) |
| **DD-M11** A case is a one-way flag on the thread (`is_case`, `case_opened_at`, `case_opened_by_person_id`), set by `communication.threads.mark_case` (non-undoable — an undo would unmark the case) with a conditional update (`WHERE is_case = false`); the revise and delete commands refuse case threads with 409 `case_immutable`, and no unmark command exists (Q9 default: case-specific) | One consumer in scope (#36); the phase 4 candidates are held back (A02) | A generic `Sealable` helper | The extraction rule (≥ 2 stories) |
| **DD-M12** Thread visibility = participants (the author and every person addressed by a message of the thread, `communication_thread_participants`) ∪ the coordinators of the thread's section ∪ the club administrator; the list route filters with an explicit `EXISTS` on participants ∪ `scopeWhere` for the section and club grants (participation is not a grant kind). Members see the staff's messages and their own household's replies only; a member's reply is dispatched to the thread's staff (the author, the scope's coaches and coordinators) — never to other families (R15; group-wide discussion stays in the chat, D09) | The inbox needs "my threads" without re-resolving old audiences; R15 makes other children's names a club setting | Visibility by the current scope membership | A child who left the group would lose the history of their own messages; a newcomer would read old threads |
| **DD-M13** Unread state is one read marker per (thread, person) (`last_read_at`, upserted on open); the tile count = threads where `last_message_at > last_read_at` | Cheap, no per-message rows | Per-message read rows | Read receipts are a non-goal; ~200 people × messages rows for no use |
| **DD-M14** The share text and the public session page belong to `activities` (Q10 default): `GET /api/communication/share-text?occurrenceId` asks `activities` (DI `activities.shareText`) for `{ text, url }`, and `?threadId` builds the text in `communication` with the sign-in link `/club/messages/[threadId]`; the page `/p/[clubSlug]/s/[occurrenceId]` resolves the club by its slug (the existing DD-35 lookup) and the session by id inside that organization, and shows the activity name, date, time and status only | DD-17; no new system-scope key; the session id identifies a session, never a person (club spec, `occurrencePublicRef`) | A random public reference column | A second id for the same thing; the uuid is already unguessable |
| **DD-M15** Modules enabled (Q4 = A, Ask First): `communication_channels`, `progress`, `integrations` and `channel_resend`; `messages` only if phase A step 1 shows the app does not boot without it (`communication_channels` declares `requires: ['progress']` but extends `messages:message`), and then with no `messages.*` feature in any `vereino_*` role, so `/backend/messages` cannot bypass cases or R15; `SYSTEM_EMAIL_PROVIDER=resend`, `NOTIFICATIONS_EMAIL_FROM`; tests and local runs use `OM_TEST_MODE` capture | V-M02: `sendEmail` throws without a registered transport, and only `communication_channels` registers one | SES (B); own SMTP transport (C, a new dependency) | B is the same shape with AWS credentials; C adds a dependency the platform already covers |
| **DD-M17** The 1.0 e-mail profile amends S12 (Q14 = C): `List-Unsubscribe` waived for the non-opt-out phase 3 e-mails (S12.3); the delivery row is the per-recipient idempotency record and the worker caps sends at 8/s (S12.4); bounce and suppression webhooks deferred (S12.5); the sink and the staging allowlist through `OM_TEST_MODE`, `OM_DISABLE_EMAIL_DELIVERY` and the `foundation.emailSender` seam (S12.6). An upstream proposal to Open Mercato adds an optional `headers` field and a returned provider message id to `sendEmail`; when it ships, S12.3–S12.5 return unamended through the same seam | `sendEmail` takes no headers and returns no message id (V-M02, V-M03); a provider package of our own is forbidden in `packages/*` (AGENTS.md) and would block phase 3 | Keep S12 fully now (B); amend without an upstream proposal (A) | B blocks phase 3 on a new published package; A leaves the gap open for good |
| **DD-M16** Shared UI is three pieces (Q11 default): `EmailLayout` (every e-mail), `AudiencePicker` and `DeliveryStatusList` (admin; consumers #35, phase 4 campaigns and reminders); the thread view, composer page and member inbox stay in `communication` | ≥ 2 consumers each for the shared three; one for the rest | Share the thread and inbox views | One consumer (REQ-F16) |

## Domain Vocabulary and Business Rules

| Term | Definition | Owner | Rule / failure |
|---|---|---|---|
| Audience | `{ kind, ids? }` with `kind` ∈ `club`, `section`, `group`, `activity`, `occurrence`, `persons` (the thread scope `direct` is an audience of kind `persons`); data, never a query | `@vereino/core` type; providers per kind | Unknown or unregistered kind → 422 `audience_kind_unavailable`; an author's audience outside their grants → 403 `scope_denied` (checked by the consuming command) |
| Audience member | A person in the audience with a reason: `participant`, `coach`, `guardian` (added by expansion) or `direct` | the kind's provider; expansion in core | Members are active at `today` in the club zone (foundation I `Validity`) |
| Expansion | A participant younger than 18 on `today` adds their active guardians; the minor stays a recipient only with an account; a participant aged 18+ and coaches stay; one person appears once with all their reasons | `@vereino/core` (`expandAudience`) | A minor without an account and without an active guardian → counted `unreachable` |
| Recipient | A person (or, for phase 5 requesters, a bare address) with `channels` (in-app if the person has an account; e-mail if an address is known), a `locale` and its reasons | `foundation` (`resolveAudience`) | No channel → delivery `skipped` / `unreachable` |
| Dispatch | One message to many recipients: `template`, `params`, `audience` snapshot, `source` (module, entity, id), `idempotency_key`, actor and acting role | `foundation` | A second enqueue with the same key in the organization returns the first dispatch (no new rows) |
| Delivery | One recipient × one channel of a dispatch: `queued` → `sent` \| `failed` \| `skipped`; attempts, next attempt, coded failure; optional encrypted secret | `foundation` | Final states never change; a secret is wiped at the final state |
| E-mail template | `id`, the notification type it maps to, `optOut` class, typed `params`, localized subject and body | the module that sends it | Params that fail the schema → `render_failed`, no send |
| Thread | A conversation with a scope (`club` / `section` / `group` / `activity` / `occurrence` / `direct`), an encrypted subject, a section snapshot for permissions, `last_message_at`, and the case flag | `communication` | Scope outside the author's grants → 403 |
| Thread message | An append-only row: `message`, `revision` (supersedes a message) or `tombstone` (deletes it); encrypted `body`; author (null for a system message, acting role `system`), acting role, the dispatch id | `communication` | Revision or tombstone by anyone but the author (or a coordinator of the section) → 403; on a case → 409 `case_immutable` |
| Participant | The author and every person addressed by a message of the thread | `communication` | Added, never removed |
| Case | A thread with `is_case = true`; one-way | `communication` | Edit, delete, unmark → 409 `case_immutable`; mark twice → 409 `case_already_open` |
| Share text | A one-line text in the club's language with the public session URL | `activities` (builder) | No names, no roster, no token |

## Users, Permissions, and Scope

| Actor | Can | Scope | Features |
|---|---|---|---|
| Club administrator | post to any scope; read every thread and case; mark cases | `club_admin` grant | `communication.view`, `communication.post`, `communication.cases.manage` |
| Section coordinator | post to their sections and everything under them; read the threads of their sections; mark cases there | `coordinator` grant (`section_ids`) | `communication.view`, `communication.post`, `communication.cases.manage` |
| Coach / instructor | post to their groups and their groups' activities and sessions; read the threads they participate in | `coach` grant (`coached_group_ids`) | `communication.view`, `communication.post` |
| Guardian, participant with an account | read and reply to the threads they participate in | `participant` (DD-M12) | `communication.view` |
| Anyone | open the public session page | none (DD-M14) | — |

The features are the club spec's (its *Users, Permissions, and Scope* table); this spec adds none. Every command runs `authorizeScoped` (foundation I P-02) with the audience target: `club` → `club_admin`; `section` → `coordinator`, `club_admin`; `group`, `activity`, `occurrence` → `coach`, `coordinator`, `club_admin` (least-privileged first); `persons` → the `people` provider returns only persons inside the author's scope and the command refuses the whole request with 403 `scope_denied` when any id falls outside. Lists use an explicit `EXISTS` on participants plus `scopeWhere` over the section and club columns (DD-M12). The cancellation subscriber runs `authorizeScoped` with foundation I's job source (`system_job`, acting role `system`) taken from the event's tenant and organization. `foundation` adds no feature: `resolveAudience` and `dispatch` run inside the caller's authorized command; the delivery list is served by the consumer's route with the consumer's gate.

## Reuse and Ownership Map

| ID | Primitive | Status | Home | Installed seam (verified 2026-10-27) | Why |
|---|---|---|---|---|---|
| P-29 | `AudienceSpec`, `expandAudience` (core) + `resolveAudience`, tokens `vereino.audience.<kind>` and `vereino.contactResolver` | primitive | `@vereino/core` + `foundation/services` | Awilix `hasRegistration` (the `vereino.scopeProvider` pattern) | DD-M05, DD-M06; consumers #35, the cancellation thread (REQ-M07), REQ-017 reminders, phase 4 reminders and campaigns, phase 5 notices |
| P-30 | `dispatch` (`enqueue`, `publish`, `deliveriesOf`) + worker `foundation:dispatch-deliver` + sweeper `foundation:dispatch-sweep` | primitive | `foundation` (tables, services, workers) | `notificationService.createBatch` (≤ 1000), `sendEmail`, `@open-mercato/queue`, the bulk outbox pattern (`example/lib/todoBulkComplete.ts`), P-12 `registerModuleSchedule` | DD-M02…DD-M04, DD-M07…DD-M09; every e-mail of phases 3–5 |
| P-31 | `defineEmailTemplate` + the template registry (`foundation/services`), `EmailLayout` (`@vereino/ui/emails`) | primitive | `foundation` + `@vereino/ui` | `sendEmail({ react })`, `loadDictionary` via foundation I P-16, `notificationTypes` for the type mapping | DD-M08; every e-mail of phases 3–5 |
| P-32 | `AudiencePicker`, `DeliveryStatusList` | primitive | `@vereino/ui` (admin) | `CrudForm` custom field, `DataTable`, `StatusBadge`, `apiCall` | DD-M16; consumers #35, phase 4 campaigns and reminders |
| P-28 | `AppendOnlyEntityBase` (foundation II) | reused | `@vereino/db` | — | thread messages, its second consumer (DD-M10) |
| P-02, P-03 | `authorizeScoped`, `scopeWhere` (foundation I) | reused | `foundation` | — | every command and list here |
| P-12 | `registerModuleSchedule` (foundation II, built in foundation I A1) | reused | `foundation` | — | the sweeper |
| P-16 | `renderLocalized` (foundation I) | reused | `foundation` | — | per-recipient locale |
| — | threads, messages, participants, read markers, cases, the inbox | module logic | `communication` | — | DD-M01, DD-M10…DD-M13 |
| — | share text, public session page | module logic | `activities` | the DD-35 club-slug lookup | DD-M14 |
| — | `messages` | enabled, not used | platform | required by `communication_channels` | DD-M15 |

## Architecture and Data Flow

```text
communication.threads.create (route ─► command; execute → authorizeScoped(target = audience))
   ─► resolveAudience(spec, ctx)             [foundation]  provider vereino.audience.<kind> ─► members
                                                          contactResolver ─► guardians, accounts, addresses, locales
                                                          expandAudience [core] ─► recipients (deduped, reasons, channels)
   ─► thread + first message (append-only, encrypted) + participants        [communication tables, same tx]
   ─► dispatch.enqueue(em, { template: 'communication.announcement', params: { threadId, subject?, excerpt }, recipients,
                             source, idempotencyKey: `communication:thread:${messageId}` })   [foundation tables, same tx]
   commit ─► emitCrudSideEffects ─► dispatch.publish(dispatchId) ─► queue foundation-dispatch (jobs = { dispatchId | deliveryId, tenantId, organizationId })
worker foundation:dispatch-deliver (reads the row by id AND tenant AND organization; lease on the delivery row; ≤ 8 e-mails/s)
   in_app  ─► one job per dispatch ─► notificationService.createBatch(type, userIds, channels ['in_app'], groupKey = dispatchId)   [ids and keys only]
   email   ─► opt-out check ─► template registry ─► renderLocalized(locale) ─► EmailLayout + body ─► foundation.emailSender (sendEmail)
           ─► sent | attempt++ and next_attempt_at | failed (code) ─► foundation.dispatch.delivery_failed { dispatchId, deliveryId }
           ─► secret_params := null at the final state
sweeper foundation:dispatch-sweep (every 2 min, P-12) ─► republish deliveries queued past next_attempt_at or with an expired lease
activities.occurrence.cancelled ─► communication subscriber (persistent; idempotency key = the event id; authorizeScoped with the system_job source)
   ─► the session thread (unique per occurrence) + a system message with the reason + dispatch e-mail only (in-app stays activities' phase 2 notification)
GET /api/communication/share-text?occurrenceId ─► activities.shareText (DI) ─► { text, url: /p/[clubSlug]/s/[occurrenceId] }
GET /api/communication/share-text?threadId    ─► communication ─► { text, url: /club/messages/[threadId] (sign-in) }
/p/[clubSlug]/s/[occurrenceId] ─► DD-35 slug lookup ─► occurrence by id in that organization ─► name, date, time, status
```

- **Dependency direction:** `app → ui | db → core` unchanged. `communication` → `foundation`, and → `activities` only through the optional DI `activities.shareText` (absent → no share text, 404); `activities`, `groups`, `people` → `foundation` (they register audience providers); `foundation` imports no business module. `activities` no longer needs `communication` to send anything: it calls `dispatch` (the review's cycle is gone).
- **Extension points this slice defines:** tokens `vereino.audience.<kind>` and `vereino.contactResolver`; the e-mail template registry (`vereino.emailTemplate.<id>`); the e-mail sender seam `foundation.emailSender` (tests and the staging allowlist of S12.6 replace it); the event `foundation.dispatch.delivery_failed`.
- **Compatibility:** the tokens, the template ids, the notification type ids, the event id, the job ids `foundation:dispatch-deliver` / `foundation:dispatch-sweep`, the tables and the error codes become protected surfaces at the first deployment (`BACKWARD_COMPATIBILITY.md` §2, §4, §8). The TypeScript APIs of `@vereino/core|db|ui` and `foundation` stay internal (§1).

## User Journeys

### Journey J-M01 — An announcement to a group (consumer: #35)

1. Coach Marek opens `/backend/communication/threads/create`, picks "Group: Rocznik 2015" in `AudiencePicker` (only his groups are offered), sees "38 recipients — 2 without an e-mail address", writes the subject and text, and posts.
2. `communication.threads.create` authorizes the group target (`coach`), resolves the audience (14 children under 18 → 23 guardians plus the two children who have their own account, 1 assistant coach, Marek excluded from the audience but added as a participant), writes the thread, the message and the participants, and enqueues one dispatch with in-app deliveries for account holders and e-mail deliveries for everyone with an address.
3. After commit the worker delivers: account holders see a notification; e-mails arrive in Polish for most guardians and in English for the guardian whose `preferred_locale` is `en`.
4. One address is rejected by the provider after five attempts: the thread shows "not delivered" next to that guardian in `DeliveryStatusList`.
5. Marek copies the share text and pastes it into the group chat.

### Journey J-M02 — A cancellation and the public page (consumer: J-003 steps 1–3)

1. The coordinator cancels Tuesday's session ("downpour"). `activities` emits `activities.occurrence.cancelled`; its phase 2 in-app notification fires; the `communication` subscriber creates the session thread with the reason and dispatches the e-mail `communication.session_cancelled` to the session audience.
2. A parent without an account opens the share link from the chat: `/p/dev-academy/s/<id>` shows "Akademia piłkarska · Rocznik 2015 — training, Tue 3 Nov, 17:00–18:30 — cancelled" and a sign-in button; no names, no roster.

### Journey J-M03 — A case (consumer: #36)

1. A parent replies in the session thread (the reply reaches the coach and the coordinator, not the other families); the coordinator marks the thread as a case.
2. The parent's attempt to edit the reply and the coordinator's attempt to delete it both return 409 `case_immutable`; the thread shows the full history; the coordinator of another section cannot open it.

## UI and Interaction Contracts

### UI architecture

- **Admin:** the platform shell, `DataTable`, `CrudForm`, `StatusBadge`, `apiCall` (`backend-ui.md`); references `/backend/messages` and `/backend/messages/[id]` (the installed message family pages) for the list and detail layout, the `CrudForm` custom-field pattern of `example` for `AudiencePicker`.
- **Member:** Tailwind pages inside foundation I's `MemberPage` shell (P-18), phone-first; reference `/[orgSlug]/portal/dashboard` for the tile and list rhythm.
- **E-mail:** `EmailLayout` renders the club name, the localized preheader, the body, a primary button when the template has a link, and a footer with the reason ("you receive this because you are the guardian of …") and, for `preferences` templates, the preferences link; plain-text alternative always; no images, no tracking pixels.

| Surface | Purpose | Data / mutations | Components | States |
|---|---|---|---|---|
| `/backend/communication/threads` | threads in scope, filter by scope, "cases only", unread | `GET /api/communication/threads` | `DataTable` | loading, empty ("No threads yet"), error, keyboard |
| `/backend/communication/threads/create` | the composer | `POST /api/communication/threads`; preview `POST /api/communication/audience/preview` | `CrudForm` + `AudiencePicker` | validation, 403 (scope), 422 (`audience_kind_unavailable`), sending |
| `/backend/communication/threads/[id]` | messages with history, reply, "Copy text for group chat", mark as case, recipients | `GET …/{id}`, `POST …/replies`, `PATCH/DELETE …/messages/{id}`, `POST …/case`, `GET …/deliveries` | message list, `DeliveryStatusList`, `useConfirmDialog` for "Mark as case" | conflict (409 version), case read-only banner, delivery states, copy confirmation (`aria-live`) |
| `/backend/communication/cases` | the case register | `GET /api/communication/threads?isCase=1` | `DataTable` | as threads |
| `/club/messages` (+ `[threadId]`) | member inbox and thread | `GET /api/communication/threads`, `POST …/replies`, `POST …/read` | Tailwind list and thread | loading, empty, error, unread dot, 375 px, dark |
| "Messages" tile on `/club` | unread count | `GET /api/communication/threads/unread-count` | `vereino:club:tiles` widget | 0 hidden badge, error hidden |
| `/p/[clubSlug]/s/[occurrenceId]` | DD-17 public session page | `activities` page loader | `PublicPageShell` (foundation I P-19) | not found (404 copy without detail), cancelled tone |

`AudiencePicker`: a two-step field — kind (only kinds the author's grants allow) then target (searchable select fed by the consumer) — and a live line "N recipients · M without an e-mail address · K unreachable" from the consumer's preview route, debounced, with a loading and an error state; keyboard-operable, `aria-describedby` on the count. `DeliveryStatusList`: columns recipient, reason, channel, status (`StatusBadge`: sent = success, queued = neutral, failed = error "not delivered", skipped = muted with the reason), last attempt; filter "problems only"; the recipient name is visible to staff only.

Text mock-up of the thread detail (admin):

```text
Rocznik 2015 — Sobota: zmiana godziny                         [Copy text for group chat] [Mark as case]
Group: Rocznik 2015 · posted by Marek (coach) · 38 recipients
──────────────────────────────────────────────────────────────
Marek (coach) · 27 Oct 18:04
  Mecz w sobotę zaczyna się o 11:00, zbiórka 10:15.
Anna K. (guardian) · 27 Oct 19:10 · edited
  Czy jest transport?
──────────────────────────────────────────────────────────────
Recipients  [problems only ☐]
  Anna K.     guardian   e-mail  sent          27 Oct 18:05
  Tomasz W.   guardian   e-mail  not delivered 27 Oct 19:20 (provider rejected)
  Ola N.      participant in-app sent          27 Oct 18:04
```

## Data Models

### `foundation_dispatches` (`foundation`, `ScopedEntityBase`)

| Column | Type | Rule |
|---|---|---|
| `template_id` | text | a registered template |
| `source_module`, `source_type` | text | e.g. `communication`, `communication:thread_message` |
| `source_id` | uuid | the record that caused it |
| `idempotency_key` | text | unique (`organization_id`, `idempotency_key`) |
| `audience` | jsonb | the `AudienceSpec` (kind and ids only) |
| `params` | text (encrypted JSON) | template params common to all recipients; ids and club-entered text the template needs (the subject and excerpt may be personal) |
| `actor_user_id`, `acting_role` | uuid, text | from `authorizeScoped` |
| `status` | enum `queued` / `done` | `done` when every delivery is final |
| `published_at` | timestamptz? | set by `publish`; the sweeper republishes dispatches with queued deliveries past `next_attempt_at` |
| `recipient_count`, `sent_count`, `failed_count`, `skipped_count` | int | maintained by the worker |

### `foundation_deliveries` (`foundation`, `ScopedEntityBase`)

| Column | Type | Rule |
|---|---|---|
| `dispatch_id` | uuid | index (`organization_id`, `dispatch_id`, `status`) |
| `person_id`, `user_id` | uuid? | at least one of `person_id`, `email` |
| `channel` | enum `in_app` / `email` | unique (`dispatch_id`, `person_id`, `channel`) for persons |
| `email`, `email_hash` | text? | encrypted address snapshot and its hash; the address is wiped at the final state, the hash kept |
| `locale` | text | resolved at enqueue |
| `reasons` | text[] | `participant`, `coach`, `guardian`, `direct` |
| `status` | enum `queued` / `sent` / `failed` / `skipped` | final states never change |
| `skip_reason` | enum? `unreachable` / `opted_out` / `delivery_disabled` | — |
| `attempts`, `next_attempt_at` | int, timestamptz | `next_attempt_at = now()` at enqueue; `attempts` incremented when the lease is taken; ≤ 5; index (`status`, `next_attempt_at`) |
| `lease_owner`, `lease_expires_at` | text?, timestamptz? | the per-delivery lease (DD-M03) |
| `sent_at`, `failed_at` | timestamptz? | — |
| `failure_code` | text? | `transport_unavailable`, `provider_rejected`, `address_invalid`, `render_failed` |
| `secret_params` | text? (encrypted json) | DD-M04; e-mail deliveries only; wiped at the final state |

### `communication` (replaces the club spec's two rows)

| Entity / table | Fields | Indexes and uniqueness | Sensitive | Lifecycle |
|---|---|---|---|---|
| `Thread` / `communication_threads` (`ScopedEntityBase`) | `scope_type` enum; `scope_id` uuid?; `section_id` uuid? (snapshot for permissions); `subject` text; `author_person_id` uuid; `is_case` bool; `case_opened_at` timestamptz?; `case_opened_by_person_id` uuid?; `last_message_at` timestamptz | (`organization_id`, `scope_type`, `scope_id`), unique where `scope_type = 'occurrence'` (one session thread); (`organization_id`, `section_id`, `is_case`); (`organization_id`, `last_message_at`) | `subject` encrypted | `is_case` false → true only; a thread is never deleted |
| `ThreadMessage` / `communication_thread_messages` (`AppendOnlyEntityBase`) | `thread_id` uuid; `kind` enum (`message` / `revision` / `tombstone`); `supersedes_message_id` uuid?; `author_person_id` uuid? (null for a system message); `acting_role` text; `audience` enum (`all` / `staff`) — a member's reply is `staff`; `body` text?; `dispatch_id` uuid?; `recipient_count` int | (`organization_id`, `thread_id`, `created_at`); (`supersedes_message_id`) | `body` encrypted | append-only (P-28); a `tombstone` has no body |
| `ThreadParticipant` / `communication_thread_participants` (`AppendOnlyEntityBase`) | `thread_id`, `person_id` uuid; `reasons` text[] (incl. `author`) | unique (`thread_id`, `person_id`); (`organization_id`, `person_id`) | no | added, never removed |
| `ThreadRead` / `communication_thread_reads` (`ScopedEntityBase`) | `thread_id`, `person_id` uuid; `last_read_at` timestamptz | unique (`thread_id`, `person_id`) | no | upserted on open |

No column is added to `activities` (DD-M14).

## API, Command, and Error Contracts

TypeScript APIs (each signature stated once):

| ID | Export (home) | Signature (abridged) | Behaviour and errors |
|---|---|---|---|
| P-29 | `AudienceSpec`, `AudienceMember`, `Recipient`, `expandAudience(members, contacts, today) → { recipients, unreachable }` (`@vereino/core`); `resolveAudience(spec, ctx, { exclude? }) → { recipients, counts }` (`foundation/services`); provider contract `{ members(spec, ctx) → AudienceMember[] }`; contact resolver contract `{ contacts(personIds, ctx) → Contact[], guardiansOf(personIds, today, ctx) → Map<personId, personId[]> }` | pure expansion per *Vocabulary*; the resolver is called with the author's tenant and organization and returns ids, user ids, `email` (decrypted in memory only), `locale` and `birth_date`; `exclude` drops the author | absent provider → 422 `audience_kind_unavailable`; a `persons` id outside the author's scope → 403 `scope_denied`; absent contact resolver → 500 fingerprint `foundation.audience.contacts_unavailable`; > 2000 recipients → 422 `audience_too_large` (a club of ~200; protects the fan-out) |
| P-30 | `dispatch.enqueue(em, { template, params, recipients \| audience, source, idempotencyKey, secrets?: Map<recipientKey, object>, actor })` → `{ dispatchId, created: boolean }` (`recipientKey` = the person id, or the address hash for a bare address; secrets attach to e-mail deliveries only); `dispatch.publish(dispatchId)`; `dispatch.deliveriesOf(dispatchId, page) → PagedList<DeliveryView>` (`foundation/services`) | `enqueue` validates `params` with the template schema, writes rows with the caller's `em` (same transaction), returns the existing dispatch for a repeated key; `publish` enqueues one job per queued delivery in batches; `deliveriesOf` returns ids, names through the contact resolver, status, reason and timestamps — never the address | unknown template → 500 fingerprint `foundation.dispatch.unknown_template` (a programming error); invalid params → 422 `dispatch_params_invalid`; `publish` failure is logged and left to the sweeper |
| P-30 | worker `foundation:dispatch-deliver` (queue `foundation-dispatch`, concurrency 5, a token bucket of 8 e-mails/s per process) and `foundation:dispatch-sweep` (every 2 min, P-12); the seam `foundation.emailSender` (`send(options) → void`, default `sendEmail`) | a job carries `{ dispatchId \| deliveryId, tenantId, organizationId }` written by the server; the worker reads the row by id **and** tenant **and** organization and refuses a mismatch; e-mail: take the lease (`UPDATE … SET attempts = attempts + 1, lease_owner = ?, lease_expires_at = now() + 2 min WHERE id = ? AND status = 'queued' AND next_attempt_at <= now() AND (lease_expires_at IS NULL OR lease_expires_at < now())`), check opt-out, render, send, write the final state or the next attempt; in-app: one job per dispatch, `createBatch` per 1000 user ids with `groupKey` = the dispatch id, then the in-app rows `sent` | a lost lease race → no send; at least once (DD-M03); disabled delivery → `skipped` / `delivery_disabled` |
| P-31 | `defineEmailTemplate({ id, notificationType, optOut: 'never' \| 'preferences', params: ZodType, subject(t, p) → string, body(t, p, ctx) → ReactElement, text(t, p) → string, link?(p, ctx) → URL })` and `registerEmailTemplate(container, template)`; `EmailLayout({ clubName, preheader, reason, action?, preferencesUrl?, children })` (`@vereino/ui/emails`) | `t` is the recipient's dictionary (P-16); club-entered strings are passed as params and rendered as escaped text with paragraph breaks; links use `APP_URL` | a render error → `render_failed`, no send |
| P-32 | `AudiencePicker({ allowedKinds, loadTargets(kind, query), preview(spec) → counts })`, `DeliveryStatusList({ load(page, filter) })` (`@vereino/ui`) | DD-M16 | the consumer's errors are shown inline |

Commands and routes of `communication` (the club spec's rows, amended):

| Method / command | Path | Gate | Input | Output and effects | Errors |
|---|---|---|---|---|---|
| `GET`, `POST` / `communication.threads.create` | `/api/communication/threads` | `communication.view` / `communication.post` + scope | `GET`: `scopeType`, `scopeId`, `isCase=1`, `unread=1`; `POST { audience, subject, body }` | 201 `{ threadId, messageId, dispatchId }`; `communication.thread.created`; dispatch `communication.announcement` | 403 `scope_denied`; 422 `audience_kind_unavailable`, `audience_too_large`, validation |
| `POST` | `/api/communication/audience/preview` | `communication.post` + scope | `{ audience }` | `{ recipients, withoutEmail, unreachable }` (counts only) | 403, 422 |
| `POST` / `communication.threads.reply` | `/api/communication/threads/{id}/replies` | `communication.view` + participant, section coordinator or admin | `{ body }` | `communication.message.posted`; a staff reply is dispatched to all participants, a member's reply (`audience = staff`) to the thread's staff only (DD-M12) | 403 |
| `PATCH`, `DELETE` / `communication.messages.revise`, `communication.messages.delete` | `/api/communication/threads/{id}/messages/{messageId}` | author, or `communication.cases.manage` + section | `PATCH { body }` + version of the thread; `DELETE` + version | a `revision` or `tombstone` row; `communication.message.updated` / `deleted` | 403; 409 `case_immutable`; 409 `optimistic_lock_conflict` |
| `POST` / `communication.threads.mark_case` | `/api/communication/threads/{id}/case` | `communication.cases.manage` + section | — | `communication.case.opened` | 409 `case_already_open`; 403 |
| `POST` / `communication.threads.mark_read` | `/api/communication/threads/{id}/read` | participant | — | read marker upserted (not logged) | 403 |
| `GET` | `/api/communication/threads/unread-count` | `communication.view` | — | `{ count }` | — |
| `GET` | `/api/communication/threads/{id}/deliveries` | `communication.post` + section or author | `page`, `problems=1` | `PagedList<DeliveryView>` | 403 |
| `GET` | `/api/communication/share-text` | `communication.post` + scope | `{ occurrenceId }` or `{ threadId }` | `{ text, url }` (DD-M14) | 403; 404 when `activities.shareText` is absent for a session |

Error codes: `foundation` adds `audience_kind_unavailable` (422), `audience_too_large` (422), `dispatch_params_invalid` (422); `communication` declares `case_immutable` (409, the club spec's), `case_already_open` (409). Every `communication` command is `isUndoable: false` with its reason in the JSDoc: `threads.create` and `reply` (e-mails cannot be recalled), `revise` and `delete` (they append a revision or a tombstone; the history is the record), `mark_case` (an undo would unmark the case), `mark_read` (no business state). Uncoded 500s carry fingerprints `foundation.audience.contacts_unavailable`, `foundation.dispatch.unknown_template`. Lists use the paged envelope (S6.4).

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit |
|---|---|---|---|---|
| `dispatch.publish` after commit | the calling module | `foundation:dispatch-deliver` | one in-app job per dispatch and one job per e-mail delivery, each `{ id, tenantId, organizationId }` | the lease; the sweeper republishes |
| `foundation:dispatch-sweep` (every 2 min, P-12) | `foundation` | `foundation-dispatch` queue | republish queued deliveries past `next_attempt_at` or with an expired lease | no-op when nothing is due |
| `foundation.dispatch.delivery_failed` `{ id: deliveryId, dispatchId, tenantId, organizationId }` | `foundation` | `communication` (badge refresh), observability | — | ids only (S4.6) |
| `communication.thread.created`, `communication.message.posted`, `.updated`, `.deleted`, `communication.case.opened` | `communication` | search, notifications (none extra) | — | ids only; the club spec's ids |
| `activities.occurrence.cancelled` | `activities` | `communication` subscriber `communication:session-cancelled` (persistent) | the session thread (unique per occurrence) created or extended with a system message carrying the reason; dispatch `communication.session_cancelled` (e-mail only) | idempotency key `communication:cancel:${eventId}` (S4.6: keyed by event id); `authorizeScoped` with the `system_job` source |

Notification types (`communication/notifications.ts`, `channels: ['in_app']`): `communication.announcement` (`nonOptOut`), `communication.reply`. E-mail templates (`communication/emails/`): `communication.announcement`, `communication.reply`, `communication.session_cancelled` — all `optOut: 'never'` (Q15 = B). The club spec's events row `messages.message.email_failed` is replaced by `foundation.dispatch.delivery_failed`.

## Security, Privacy, and Compliance

- **Authorization and scope:** every command authorizes its audience target with `authorizeScoped`; the preview route reveals counts only; members never see other families' names or replies (DD-M12, R15); in-app notifications carry ids and keys only; `DeliveryStatusList` is served to staff with the section or author gate.
- **Tenant isolation:** dispatch rows carry the caller's tenant and organization; a job carries the id with the tenant and organization the server wrote; the worker reads the row by all three and refuses a mismatch, so no read is system-scoped; the public session page uses the existing DD-35 slug lookup and then filters by that organization — no new system-scope key.
- **Secrets:** link tokens only in `secret_params` (encrypted), wiped at the final state; job payloads and events carry ids; the worker logs ids and codes only (REQ-M03).
- **Personal data:** thread subjects, message bodies, dispatch params and delivery addresses are encrypted (the module encryption maps); addresses are wiped after the final state, hashes kept; the provider's error text is not stored (DD-M09).
- **Lawful basis:** e-mails to guardians without an account use the address the club holds for the purpose "club announcements and session changes" — the data-protection notice must name it (Q6 = A; the notice text is the pilot club's, open since D25).
- **Abuse:** the public page has `metadata.rateLimit` (V-10); `audience_too_large` caps a fan-out; only staff can post.
- **Failure modes (S3.6):** transport down → attempts with backoff, then `failed` / `transport_unavailable`; a permanent provider rejection → `failed` / `provider_rejected` at once; delivery disabled → `skipped` / `delivery_disabled`; a crashed worker → the lease expires and the sweeper republishes; contact resolver missing → 500 before anything is written; template render error → `render_failed` for that delivery only.
- **Retention:** open for the owner (the GDPR decision on the foundation specs); this spec wipes addresses and secrets and keeps ids, statuses and hashes.

## Integration Coverage

Integration tests live in `packages/app/.ai/qa/tests/foundation/messaging/` and `…/communication/`; unit tests next to the code (100 % for `@vereino/core` and `foundation/lib/**`); e-mails are read from the `OM_TEST_MODE` capture.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-M01 | unit + integration | a group with participants aged 9, 14 (with an account) and 19; guardians with and without accounts, one without an e-mail; a guardian of two children in the group; a coach who is also a guardian; providers registered and one kind unregistered; a `persons` audience with one person outside the author's scope | `expandAudience`; `resolveAudience` per kind, counts through the service | the 9-year-old reached through the guardians, the 14-year-old and the guardians both reached, the 19-year-old kept; a `persons` id outside scope → 403; one delivery per person and channel with both reasons; no account → e-mail only; no address and no account → unreachable; unregistered kind → 422; the author excluded | REQ-M01 |
| TEST-M02 | integration | a probe module with a probe template; the `foundation.emailSender` seam replaced by a sender that fails twice then succeeds, one that always fails transiently, one that fails permanently and one that crashes the worker; a job with a forged organization | enqueue twice with one key; commit and roll back the caller; run the worker; lose a lease; run the sweeper; send to 50 recipients; `OM_DISABLE_EMAIL_DELIVERY` | one dispatch for one key; nothing sent after a rollback; retries until `sent`; transient → `failed` after 5 attempts, permanent → `failed` at once, the crashing one `failed` after 5; one `delivery_failed` event each; the sweeper resumes a lost lease (at most one resend); ≤ 8 sends per second; the forged job refused; disabled → `skipped` / `delivery_disabled`; in-app replayed once → one notification per user | REQ-M02 |
| TEST-M03 | integration + security | a template with a secret link | enqueue with a raw token; deliver; inspect events, job payloads, logs and the row | the e-mail carries the link; no event, job payload or log line contains the token; `secret_params` is null after `sent` and after `failed` | REQ-M03 |
| TEST-M04 | integration | recipients with `pl`, `en` and no preference; a club default `pl`; an operator override enabling e-mail on the probe in-app type; a probe `preferences` template | deliver a probe `never` template; enqueue the probe `preferences` template | subjects and chrome in each recipient's language; club text verbatim and escaped (`<b>` shown as text); the `never` template delivered to everyone; the `preferences` template refused with the `foundation.dispatch.optout_unavailable` fingerprint; the platform's notification channel sent no e-mail despite the override; in-app rows carry no subject or text | REQ-M04 |
| TEST-M05 | UI | coach, coordinator, administrator | composer: pick kinds; preview; thread detail with mixed delivery states; keyboard; 375 px; dark | coach sees only group/activity/session kinds and his groups; counts update; "not delivered" visible and filterable; axe clean | REQ-M05 |
| TEST-M06 | integration | the club spec's TEST-015 fixture (group with minors, guardians with and without accounts, a 14-year-old with an account, a coach) | post to the group; reply as a guardian; reply as the coach; post to a section as a coach; open the thread as another guardian; try to undo the post | recipients per the rule (the 14-year-old and the guardians); in-app for account holders, e-mail for all with an address in their language; the guardian's reply reaches the staff only and is invisible to the other guardian; the coach's reply reaches everyone; coach → section 403; acting role recorded; no undo offered | REQ-M06 |
| TEST-M07 | integration | a planned session with recipients | cancel; replay the event; edit the session afterwards and replay again; deliver the event twice concurrently; reopen and cancel again | one session thread with a system message and the reason; one e-mail per recipient per cancellation event (replays are no-ops); one thread under concurrency; the second cancellation adds a message and one more e-mail; no second in-app notification | REQ-M07 |
| TEST-M08 | integration + security | a cancelled session; a group thread | `GET /api/communication/share-text` for both; open the session URL signed out; open an id from another club's slug; open the thread URL signed out | session text with the public URL, thread text with the sign-in URL; the page shows name, date, time, status only (no names, no roster, no counts); another club → 404 without detail; the thread URL → sign-in | REQ-M08 |
| TEST-M09 | integration | the club spec's TEST-016 fixture | revise and delete before marking; mark as case; revise, delete, undo the marking through the action log, mark again; read as section A's and B's coordinator and as the administrator; read the database | history rows kept; 409 `case_immutable` for revise/delete; the marking cannot be undone; 409 `case_already_open`; A and admin see it, B gets 403; subject and body encrypted | REQ-M09 |
| TEST-M10 | UI | guardian with three threads, one unread | `/club` tile; `/club/messages`; open the unread thread; reply; 375 px; dark; keyboard | tile count 1 then 0; unread dot cleared; reply posted; axe clean | REQ-M10 |

## Implementation Phases

Validation for every phase: `yarn verify`; `yarn test:integration:vereino --filter TEST-M…`; SQL review from `yarn db:generate` (applied only with approval). One task is one PR.

### Phase A — Audience, dispatch and templates (consumer evidence: #35)

- **Depends on:** foundation I phase A1 exit gate (P-01, P-02, P-03, P-12, P-16, P-17); the club spec's phase 2 exit gate (groups, activities); **approval to enable `communication_channels`, `progress`, `integrations`, `messages` and `channel_resend`** (DD-M15) and the Resend credentials for staging — Ask First.
- **Outcome:** any module can address an audience and deliver an e-mail and an in-app notification with a per-recipient status.
- **Why this order / value delivered:** every phase 3–5 e-mail needs it; #35 is the first.
- **Deliverables:** `packages/core/src/audience.ts`; `src/modules/foundation/{data/entities.ts (dispatches, deliveries), services/{audience,dispatch,email-templates}.ts, workers/{dispatch-deliver,dispatch-sweep}.ts, encryption.ts, lib/error-codes.ts}` and the migration; `packages/ui/src/emails/EmailLayout.tsx`; the audience providers in `people` (`club`, `persons`, contact resolver), `groups` (`section`, `group`), `activities` (`activity`, `occurrence`); `src/modules.ts` changes after approval.
- **Steps:** 1. Modules enabled (and the check whether the app boots without `messages`, DD-M15), `OM_TEST_MODE` capture and the `foundation.emailSender` seam wired into the test runner. 2. P-29 core + resolver + providers (TEST-M01). 3. P-30 tables, enqueue, publish, worker, sweeper (TEST-M02, TEST-M03). 4. P-31 registry and `EmailLayout` with probe templates (TEST-M04). The probe module and templates live under `.ai/qa` fixtures, not in a shipped module.
- **Independent slices / estimated commits:** (a) audience 2 commits; (b) dispatch 3 commits; (c) templates 1 commit. (b) after (a); (c) with (b).
- **Requirements closed:** REQ-M01, REQ-M02, REQ-M03, REQ-M04
- **Tests:** TEST-M01 … TEST-M04
- **Validation:** as above
- **Exit gate:** the four tests green on a fresh tenant; e-mails in the capture in two languages; no secret in events or logs.

### Phase B — Announcements, cancellation thread, share text and the inbox (consumer: #35)

- **Depends on:** Phase A exit gate; the club spec's phase 2 cancellation (`activities.occurrence.cancelled`); foundation I phase A2 (`MemberPage`) and foundation II phase B (P-28).
- **Outcome:** J-M01 and J-M02 pass; J-003 steps 1, 2, 4 and 5 pass (step 3's link form arrives with REQ-017).
- **Why this order / value delivered:** the parents' reason to open the app (H7) and the end of announcements in group chats.
- **Deliverables:** module `communication` (`index.ts`, `acl.ts` with the club spec's features, `setup.ts`, `data/entities.ts`, `encryption.ts`, `commands/*`, `api/*`, `subscribers/session-cancelled.ts`, `notifications.ts`, `emails/*`, `lib/error-codes.ts`, `api/errors.ts`, `i18n/{en,pl}.json`) registered in `vereino-modules.json`; `activities.shareText` and `/p/[clubSlug]/s/[occurrenceId]`; P-32 `AudiencePicker` and `DeliveryStatusList`; pages `/backend/communication/threads*`, `/club/messages*`; the "Messages" tile.
- **Steps:** 1. Threads, messages, participants, announcements and replies (TEST-M06). 2. P-32 and the admin pages (TEST-M05). 3. Cancellation subscriber, share text, public page (TEST-M07, TEST-M08). 4. Member inbox and tile (TEST-M10).
- **Independent slices / estimated commits:** (a) backend 3 commits; (b) admin UI 2 commits; (c) cancellation and share 2 commits; (d) member UI 1 commit. (b), (c), (d) after (a).
- **Requirements closed:** REQ-M05, REQ-M06, REQ-M07, REQ-M08, REQ-M10
- **Tests:** TEST-M05 … TEST-M08, TEST-M10; the club spec's TEST-015 and TEST-012 (re-run with e-mail), TEST-047 (e-mails per locale)
- **Validation:** as above; both locales, 375 px, light and dark, console clean
- **Exit gate:** #35's acceptance criteria pass except the link-request criteria that belong to REQ-017; e-mails in the test mailbox in the recipient's language.

### Phase C — Cases (consumer: #36)

- **Depends on:** Phase B exit gate.
- **Outcome:** J-M03 passes; the board has a case register.
- **Deliverables:** `communication.threads.mark_case`, the case guard in revise/delete, `/backend/communication/cases`.
- **Steps:** 1. Mark, guard and visibility (TEST-M09). 2. The case register page and the read-only banner.
- **Independent slices / estimated commits:** 2 commits.
- **Requirements closed:** REQ-M09
- **Tests:** TEST-M09; the club spec's TEST-016
- **Validation:** as above
- **Exit gate:** #36's acceptance criteria pass.

REQ-M11 lands with this spec's PR (*Rollout*). Deferred by design: bounce webhooks (Q7), a generic seal (Q9), a shared public reference (Q10), REQ-017 (foundation I phase C).

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-M01 | J-M01, composer preview | P-29, `vereino.audience.<kind>`, `vereino.contactResolver`, `audience_kind_unavailable`, `audience_too_large` | A | TEST-M01 | AC-M01 |
| REQ-M02 | J-M01 step 3–4 | P-30, `foundation_dispatches`, `foundation_deliveries`, `foundation.dispatch.delivery_failed`, the two jobs | A | TEST-M02 | AC-M02 |
| REQ-M03 | REQ-017 and phase 4–5 links | `secret_params` | A | TEST-M03 | AC-M03 |
| REQ-M04 | every e-mail | P-31, `EmailLayout`, notification types | A | TEST-M04 | AC-M04 |
| REQ-M05 | composer, thread detail | P-32 | B | TEST-M05 | AC-M05 |
| REQ-M06 | J-M01, `/backend/communication/threads*`, `/club/messages*` | `communication_*` tables, `communication.threads.*`, `communication.messages.*` | B | TEST-M06 | AC-M06 |
| REQ-M07 | J-M02 step 1 | `communication:session-cancelled`, `communication.session_cancelled` | B | TEST-M07 | AC-M07 |
| REQ-M08 | J-M02 step 2, `/p/[clubSlug]/s/[occurrenceId]` | `activities.shareText`, `/api/communication/share-text` | B | TEST-M08 | AC-M08 |
| REQ-M09 | J-M03, `/backend/communication/cases` | `mark_case`, `case_immutable`, `case_already_open` | C | TEST-M09 | AC-M09 |
| REQ-M10 | `/club/messages`, "Messages" tile | `communication_thread_reads`, `unread-count` | B | TEST-M10 | AC-M10 |
| REQ-M11 | the club spec | phase 3 row, V-4, DD-16, the `communication` rows, the e-mail-hub wording | this PR | the club spec's scripted audit | AC-M11 |

## Rollout, Migration, and Rollback

- **Migrations:** `foundation` (dispatches, deliveries) in phase A; `communication` (four tables) in phase B — generated by `yarn db:generate`, SQL in the PR, applied only with approval.
- **Modules to enable (Ask First):** `communication_channels`, `progress`, `integrations`, `messages`, `channel_resend` in phase A step 1 (DD-M15). `progress` is also foundation I phase B's request; whichever phase comes first asks.
- **Configuration:** `SYSTEM_EMAIL_PROVIDER=resend`, the Resend key (Railway secret), `NOTIFICATIONS_EMAIL_FROM`, `APP_URL`; `OM_TEST_MODE` in CI and local tests.
- **Club spec amendments (this PR):** status line and *Phase readiness* row for phase 3 (REQ-009 and REQ-010 ready; REQ-017 with foundation I phase C); V-4 result; DD-16 resolved by its fallback (DD-M01) and the review's High cycle answered (DD-M02); the `messages` reuse row ("enabled as a dependency, not used for storage") and the `message` extension row; the `communication` data model rows replaced by a pointer to this spec; the API rows amended (preview, deliveries, read, unread count, `revise`); the events rows (`messages.message.email_failed` → `foundation.dispatch.delivery_failed`; the cancellation subscriber e-mail only); the paragraph "E-mails to external requesters go through `communication`" → `dispatch`; phase 3 step 1 and deliverables; the review's Critical finding answered by REQ-M03; the dropped `message-objects.ts` surface row, TEST-015's oracle, the observability and risk rows and the phase 3 exit gate (J-003 steps 1, 2, 4, 5). **Payments and facilities specs (this PR):** their e-mail rows name their own subscribers (or, for the request link, the submitting command) → `dispatch` instead of `communication`; phase 5 depends on foundation III phase A, not on the club spec's phase 3.
- **Observability:** fingerprints `foundation.audience.contacts_unavailable`, `foundation.dispatch.unknown_template`; the worker logs `{ dispatchId, deliveryId, status, failureCode }`; counts per dispatch on the row.
- **Rollback:** disabling `communication` stops announcements and the cancellation e-mail; `activities` keeps its phase 2 in-app notification. Disabling the e-mail modules makes every e-mail delivery `failed` / `transport_unavailable` — visible, never silent.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Guardians ignore both channels (A07) | the app is not the channel of record | e-mail non-opt-out for changes (DD-M08); the share text keeps the chat pointed at the app | accepted untested (D21) |
| Bounces are invisible until Q14 is settled (DD-M09) | an address that accepts and later bounces shows "sent" | "not delivered" for send failures; S12.5's webhooks and suppression per Q14 | a typo that the provider accepts stays "sent" until then |
| At-least-once delivery (DD-M03) | a worker crash between send and status write resends one e-mail | the lease and the sweeper bound it to one resend; a provider idempotency key per Q14 removes it | a rare duplicate e-mail |
| Four or five platform modules enabled for one transport (DD-M15) | larger surface; `messages` possibly enabled but unused | Ask First; `messages` only if required, with no feature in any `vereino_*` role | an upgrade of `communication_channels` may change its requirements |
| Duplicate e-mail through the platform notification channel | two e-mails per announcement | Vereino types are `channels: ['in_app']`; TEST-M04 asserts nothing else sent | a future type declared with `email` by mistake — checked in review |
| The outbox grows | table size | ids and statuses only after the final state; retention left to the owner's GDPR decision | until the decision, rows accumulate (~200 per announcement) |
| A large audience blocks the transaction | slow post | rows are written in one batch insert; `audience_too_large` at 2000 | none at club size |

## Acceptance Criteria

- [ ] **AC-M01** — An audience of each kind resolves to the expected recipients: minors' active guardians added and minors with an account kept, `persons` outside the author's scope refused, one delivery per person and channel, account holders on two channels, others on e-mail, unreachable counted, an unregistered kind refused with 422.
- [ ] **AC-M02** — A dispatch is created once per key inside the caller's transaction, sends nothing when that transaction rolls back, retries a transient failure up to five times under either queue strategy and fails a permanent one at once, sends at most 8 e-mails per second, delivers at least once with at most one resend after a lost lease, never reads a row outside the job's tenant and organization, ends each delivery in a final state, and emits one ids-only event per final failure.
- [ ] **AC-M03** — A raw token reaches the e-mail and appears in no event, job payload or log; the delivery's secret is null after its final state.
- [ ] **AC-M04** — Each recipient gets the e-mail in their locale inside `EmailLayout`, club text verbatim and escaped; every phase 3 template is non-opt-out and a `preferences` template is refused until its opt-out exists (Q15 = B); no Vereino type is e-mailed by the platform's notification channel, even with an operator override; in-app notifications carry no subject or text.
- [ ] **AC-M05** — `AudiencePicker` offers only the kinds and targets the author's grants allow, with live counts; `DeliveryStatusList` shows every recipient's status with "not delivered" and a "problems only" filter; both keyboard-operable, light and dark, 375 px.
- [ ] **AC-M06** — An announcement to a group reaches its members with an account, the guardians of its minors and its coaches on the right channels and languages; a staff reply reaches every participant, a member's reply the staff only and no other family sees it; a coach posting to a section gets 403; the acting role is recorded; no `communication` command is undoable.
- [ ] **AC-M07** — A cancellation creates one session thread (also under concurrent delivery) with a system message and one e-mail per recipient; a replayed event sends nothing more; no second in-app notification appears.
- [ ] **AC-M08** — The share text of a session carries the public session URL and that of a thread the sign-in URL; the page shows only the activity name, date, time and status; an id under another club's slug returns 404 without detail.
- [ ] **AC-M09** — A case refuses edit and deletion with 409 `case_immutable`, cannot be unmarked (no command, no undo; marking twice → 409 `case_already_open`), keeps its history, and is visible to the section's coordinator and the administrator only, besides its participants.
- [ ] **AC-M10** — `/club/messages` lists the member's threads with unread markers; the "Messages" tile shows the unread count; reading clears it.
- [ ] **AC-M11** — The club spec reads `Ready for implementation` for phase 3's REQ-009 and REQ-010 with V-4 and DD-16 recorded and the e-mail-hub wording replaced; REQ-017 points at foundation I phase C; the payments and facilities specs no longer name `communication` as an e-mail sender.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `.ai/guides/spec-delivery.md`, `backend-ui.md`, the engineering standards (S3.6, S4.6, S6.4, S6.7, S13), foundation I and II, skill `om-spec-writing` |
| Data models, APIs, events, UI, and tests are internally consistent | pass | *Requirement Traceability*: REQ-M01…M11 each with a phase, tests and an AC; DD-M01…M16, P-29…P-32, J-M01…J-M03, TEST-M01…M10, AC-M01…M11 defined once |
| Every workflow completes end to end without a catch-all integration phase | pass | J-M01…J-M03 within phases A–C |
| Platform-native reuse and extension points were chosen before custom code | pass | in-app, transport, queue, encryption, i18n, preferences are the platform's; own code only where V-M01…V-M04 show a gap |
| UI contracts identify references, canonical components, and theme/state coverage | pass | seven surfaces with references, components and states; one text mock-up |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | phases A–C |
| Contracts of installed modules confirmed at the field and behavior level | pass | V-M01…V-M05 |
| Architectural review applied | pass | one fresh-context review (contradictions and scope; anti-patterns, platform fit and complexity; 20 findings, claims checked in the installed source) applied — see the Changelog; its S12 finding reopened the gate (Q14, Q15) |
| User approval for implementation | fail | pending: the product owner's approval on the PR; enabling the e-mail modules (Ask First) |

Verdict: `Blocked — the product owner's approval of the design on the PR, and approval to enable communication_channels, progress, integrations and channel_resend (messages only if required)`

## Open Questions

`om-spec-writing` gate — Q1–Q11 answered on 2026-10-27 by Władek Kuć ("Przyjmij rekomendowane odpowiedzi Q1–Q11 i kontynuuj projekt"); Q14–Q15, reopened by the review, answered the same day ("Przyjmij Q14 = C … i Q15 = B …"):

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q1 | Scope | Władek Kuć | yes | **A — foundation III + the club spec's phase 3 ready for REQ-009 and REQ-010; REQ-017 with foundation I phase C** — 2026-10-27 |
| Q2 | Content storage | Władek Kuć | yes | **A — own `communication` tables; `messages` not used for content** (DD-M01) — 2026-10-27 |
| Q3 | Owner of delivery | Władek Kuć | yes | **A — a `foundation` dispatch primitive; `communication` owns threads and cases** (DD-M02) — 2026-10-27 |
| Q4 | E-mail transport | Władek Kuć | yes | **A — `communication_channels`, `progress`, `integrations`, `messages`, `channel_resend`** (DD-M15; enabling stays an Ask First step of phase A) — 2026-10-27 |
| Q5 | Audience resolution | Władek Kuć | yes | **A — providers per scope kind, shared rules in the foundation** (DD-M05) — 2026-10-27 |
| Q6 | Recipients without an account | Władek Kuć | yes | **A — e-mail to the address the club holds; the notice names the purpose** (DD-M06) — 2026-10-27 |
| Q7 | "Not delivered" | Władek Kuć | yes | **A — send failure after retries; bounce webhooks later** (DD-M09) — 2026-10-27 |
| Q8 | Opt-out | Władek Kuć | yes | **A — announcements, session changes, payment and request e-mails non-opt-out; reminders by preferences** (DD-M08) — 2026-10-27 |
| Q9 | Generic seal | Władek Kuć | no | **no — case-specific in `communication`** (DD-M11) — 2026-10-27 |
| Q10 | Share text and public page | Władek Kuć | no | **in `activities`; a shared reference later** (DD-M14) — 2026-10-27 |
| Q11 | Frontend primitives | Władek Kuć | no | **`EmailLayout`, `AudiencePicker`, `DeliveryStatusList`; the rest in `communication`** (DD-M16) — 2026-10-27 |
| Q12 | #35's criteria "a 'send me a link' form" and "a link request for an unknown e-mail gets the same response" | author | no | **follow Q1: they move to REQ-017's story (foundation I phase C); #35's public page offers sign-in until then** — 2026-10-27 |
| Q13 | Retention of dispatch rows, thread messages and cases | Władek Kuć | no | **open — part of the owner's GDPR decision on the foundation specs; this spec wipes addresses and secrets only** |
| Q14 | The e-mail standards S12 (S12.3 `List-Unsubscribe`, S12.4 provider idempotency key, S12.5 bounce and suppression webhooks, S12.6 sink and allowlist) against the platform's `sendEmail`, which takes no headers and returns no message id | Władek Kuć | yes (reopened gate) | **C — S12 amended for 1.0 (DD-M17, the engineering standards' Changelog) and an upstream proposal for `headers` and a returned message id on `sendEmail`; the full S12 returns when it ships** — 2026-10-27 |
| Q15 | Opt-out mechanism for `preferences` e-mails | Władek Kuć | yes (reopened gate) | **B — every phase 3 template is non-opt-out; the opt-out is designed with the first `preferences` template (REQ-017 reminders)** (DD-M08) — 2026-10-27 |

Contract verifications (2026-10-27, `@open-mercato/*` 0.9.0, read-only):

| ID | What | Result |
|---|---|---|
| V-M01 (club V-4, storage) | `messages` as the announcement store | **Negative for storage.** Recipients are users only (`recipientUserId` required; `recipients … .max(100)`, `messages/data/validators.ts:129`); one external address per message and only for `visibility: 'public'`; e-mail rendered with `loadDictionary(defaultLocale)` (`lib/email-sender.ts:109`); the e-mail worker records a failure and does not rethrow (no retry); the sender's `delete_for_actor` deletes for everyone and is undoable — incompatible with cases. Not enabled today |
| V-M02 (club V-4, transport) | Outbound e-mail | `sendEmail({ to, subject, react \| html \| text, … })` (`shared/lib/email/send.ts:124`) throws `EMAIL_TRANSPORT_NOT_CONFIGURED` unless a transport is registered; only `communication_channels` registers one (`requires: ['progress']`, and it extends `messages:message`); providers `channel_resend` / `channel_ses` `requires: ['communication_channels', 'integrations']`; `OM_TEST_MODE` captures e-mails for tests |
| V-M03 | Delivery failures | `sendSystemEmail` throws on a failed send and discards the provider message id; the Resend adapter's `getStatus` always returns `sent` (`channel_resend/lib/adapter.ts:105`); no bounce handling installed — the `webhooks` module has an inbound adapter registry an app could use |
| V-M04 | `notifications` | `notificationTypes` with `channels: ['in_app','email']`, `nonOptOut`, preferences (`shouldDeliver`); `createBatch` up to 1000 recipients in one transaction; `groupKey` refresh; the e-mail strategy swallows errors (`email-delivery-strategy.ts:61`) and renders in the default locale; the in-app bell stores keys and variables and translates on the client |
| V-M05 | Fan-out and immutability | `@open-mercato/queue` retries thrown jobs (async: 3 attempts, backoff); the local strategy keeps no failed jobs; `ProgressService`; the bulk outbox pattern of `example/lib/todoBulkComplete.ts` (idempotency key, lease, republish, checkpoint); no legal-hold or WORM primitive — `forms` keeps append-only revisions at the service layer; `action_logs` are undoable, so they are not evidence |

## Changelog

| Date | Change |
|---|---|
| 2026-10-27 | Skeleton written by `om-spec-writing` (interactive) for #23: TLDR, the Open Questions gate (Q1–Q8 blocking, Q9–Q11 with defaults), the functionality kinds M1–M10 extracted from phases 3–5, the candidate inventory (P-29…P-32) and the installed-package checks V-M01…V-M05 (club spec V-4) |
| 2026-10-27 | Gate answered by the product owner (Q1–Q11 as recommended). Full design: REQ-M01…M11, DD-M01…M16, vocabulary, permissions, reuse map, architecture, journeys J-M01…J-M03, UI contracts with a mock-up, data models (`foundation_dispatches`, `foundation_deliveries`, four `communication` tables), TypeScript contracts, routes and error codes, events and jobs, security, TEST-M01…M10, phases A–C, traceability, rollout with the club spec amendments, risks, AC-M01…M11, compliance report; Q12 (#35's link-form criteria follow REQ-017) and Q13 (retention, open) recorded |
| 2026-10-27 | Fresh-context review applied (20 findings, platform claims checked in the installed source): recipients follow the club spec's *Thread* rule — minors with an account kept beside their guardians (DD-M06, REQ-M01, TEST-M01); a member's reply goes to staff only and other families never see it (R15; DD-M12, REQ-M06, TEST-M06); the author is a participant and lists filter with an explicit participant `EXISTS` (DD-M12); `persons` audiences limited to the author's scope; the share text also serves threads (DD-M14, REQ-M08); the outbox lease moved to the delivery row with `attempts` taken at lease and `next_attempt_at` set at enqueue, delivery declared at least once (DD-M03); jobs carry tenant and organization and the worker reads with them (security); in-app delivery one `createBatch` per dispatch with `groupKey` and `channels: ['in_app']` on every call, ids and keys only (DD-M07); the platform error classifier reused, disabled delivery recorded as `skipped` (DD-M09); an `foundation.emailSender` seam for tests and the S12.6 allowlist; ≤ 8 e-mails/s (S12.4); every `communication` command non-undoable, no unmark (DD-M11); the cancellation subscriber keyed by event id, one session thread per occurrence, a system message under the `system_job` source; `messages` enabled only if the app needs it and with no Vereino feature (DD-M15); phase A without P-28 and `MemberPage`, probe templates for its tests; the primary outcome names J-003 steps 1, 2, 4, 5. The review's S12 finding reopened the gate: Q14 (S12.3–S12.6 against `sendEmail`) and Q15 (the opt-out mechanism) |
| 2026-10-27 | Gate Q14–Q15 answered by the product owner: Q14 = C — S12.3–S12.6 amended for 1.0 in the engineering standards (DD-M17) with an upstream proposal for `headers` and a returned message id on `sendEmail`; Q15 = B — every phase 3 template non-opt-out, `dispatch` refuses a `preferences` template until its opt-out exists (DD-M08, TEST-M04, AC-M04); status and verdict updated |
