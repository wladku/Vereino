# `enrolment` — section sign-up applications (E26)

Section sign-up form spec `.ai/specs/2026-11-25-vereino-section-sign-up-form.md`, phase 2 (E26-S03, #799). The module
and its migration were approved by the product owner on 2026-11-26 (#788, Q-J01).

| Area | What |
| --- | --- |
| Tables | `enrolment_applications` (one application to one section; the participant and contact encrypted; `applicant_key` and `email_key` keyed lookup hashes; no person id until accepted, phase 3), `enrolment_confirmation_links` (single use, 1 hour, DD-J06), `enrolment_application_links` (status link until expiry, cut to closing + 30 days, DD-J07) |
| Pure logic | `lib/states.ts` (life cycle), `lib/age.ts` (reference date DD-J03, hard limits BR-J2, age fit), `lib/applications.ts` (contact normalisation, BR-J3 identity, full group, DD-J09 waiting numbers, flags, tabs, retention cut-offs), `lib/access.ts` (BR-J5 sections) |
| Commands | `enrolment.applications.submit`, `confirm`, `withdraw`, `resend_confirmation`, `resend_link` (sessionless), `reject` and `wait` (undoable decisions), `expire_unconfirmed` and `daily` (club jobs) |
| Public routes | `GET /api/enrolment/public/{club}/sections/{section}/form`, `POST …/sections/{section}/applications`, `POST /api/enrolment/public/{club}/applications/confirm|status|withdraw|resend-confirmation|resend-link` — every token lookup scoped to the club of the slug |
| Member routes | `GET /api/enrolment/applications` (tabs, filters, flags), `GET …/{id}`, `POST …/{id}/reject`, `POST …/{id}/waiting`, `GET /api/enrolment/overdue`, `GET /api/enrolment/groups/{id}/sign-up-code` (the group sign-up QR code, #869; `groups.view`) |
| Pages | P-J2 `/p/[club]/sections/[section]/apply` (`?group={id}` chooses a group, or shows closed when the form does not offer it; #869), P-J3 `/p/[club]/applications/confirm/[token]`, P-J4 `/p/[club]/applications/status/[token]`; M-J2 `/club/applications`, M-J3 `/club/applications/[id]`; B-J1 `/backend/enrolment/applications` |
| Widgets | P-J1 "Apply" on `vereino:public:section:actions`; M-J1 Today tile on `vereino:club:today:sections`; the group sign-up QR code (show, copy, share, A4 poster download) on `vereino:club:group:actions` of `/club/groups/[id]` (E29-S02, #869); the dashboard widget "Applications past the answer time" |
| DI | `enrolment.confirmationLinks`, `enrolment.applicationLinks`; reads `clubCorePublicSite`, `clubCoreSettings`, `clubCoreDirectory`, `groups.applicationTargets`, `people.personDirectory`, `people.duplicateCandidates` |
| Jobs | `enrolment:expire-unconfirmed` (hourly, R22), `enrolment:daily` (06:30: R22, R23, dead links); CLI `yarn mercato enrolment expire-unconfirmed|daily --tenant --org [--now]` |
| ACL | `enrolment.applications.view`, `enrolment.applications.decide` (coordinator), `enrolment.trials.mark` (coach, phase 4), `enrolment.manage` (club administrator) |

Rules:

- **Nothing reaches the club unconfirmed.** Lists and the detail never show `unconfirmed`; an unconfirmed application is deleted after 24 hours.
- **No enumeration.** The form answers 202 for a repeated application (a new link instead of a second row) and the resend routes answer 202 for any address.
- **Waiting numbers are computed** from `waiting_since` per group (ties by id), never stored.
- **Scope (BR-J5).** A coordinator decides the applications of their sections; an application of another section answers 404. Applications of a section without a coordinator reach the club administrators.
- **Release rule.** The section's "Accepts online applications" field stays hidden until phase 3 (#800); tests set it through the section's public route.

Not in phase 2: accepting, freed places, season rollover and season end, export and erasure, the applicant CLI (phase 3); trial sessions (phase 4).

Tests: `lib/__tests__/*` (100 % coverage); integration TEST-J02…TEST-J06, TEST-J11 (retention part); cross-club probes `.ai/qa/tests/_fixtures/isolation/inventory/enrolment.json`.
