# Run log — #799 E26-S03 sign-up form, confirmation, coordinator inbox and waiting list (phase 2)

- **Goal / trigger:** Cezar run (task 980a1da2) of `om-auto-fix-issue` for #799; phase 2 of
  `.ai/specs/2026-11-25-vereino-section-sign-up-form.md`.
- **Branch:** `feat/issue-799-sign-up-form-inbox-waiting-list`; started 2026-11-26.
- **Approvals:** owner decision on #788 (2026-11-26): module `enrolment`, its three tables, `people.duplicateCandidates`,
  `emailSubjectLimit` in `foundation`, the spot `vereino:public:section:actions`. The slug-free system-scope exception
  is not approved: every token lookup is scoped to the club from the slug.

## Plan

1. Helpers (subagents, disjoint files): compliance pack (A17, D-15, R22–R24); `emailSubjectLimit` with facilities
   switched; `people.duplicateCandidates`.
2. `enrolment` core: scaffold, entities + migration, pure lib (states, age, waiting numbers, flags, keys), validators,
   error codes, encryption, events, notifications, e-mail templates, services, commands, routes, club jobs, offboarding
   contributor, role seeds, i18n.
3. UI: P-J1 spot widget, P-J2 form, P-J3 confirm, P-J4 status; M-J1 tile, M-J2 list, M-J3 detail (reject, waiting);
   B-J1 back-office list and the overdue dashboard widget.
4. Isolation inventory + seed; integration tests TEST-J02…J06 (J06 reject/waiting), J11 retention part.
5. `yarn verify`, the integration tests locally, PR.

## Steps

(see below, newest last)
