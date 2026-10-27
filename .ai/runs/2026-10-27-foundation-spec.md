# Foundation primitives spec — authoring, review and split

- **Date:** 2026-10-27
- **Agent / tool:** Claude Code (Fable 5.1), `om-spec-writing` (interactive) with four read-only subagents: API digest of the installed packages, open-source research, scope-cohesion review (fresh context, spec path only), architectural review; then `om-open-pr`
- **Trigger:** product owner — "Chcę stworzyć specyfikację na podstawie issue #38 … żeby powstał nie tylko sam feature, ale też framework pod spodem, czyli prymitywy …", then "umożliwić logowanie za pomocą poświadczeń Google oraz Facebooka", then the gate and review answers (Q1–Q14)
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-foundation-primitives.md` and `.ai/specs/2026-10-27-vereino-social-sign-in.md`; issue #38 as the first consumer; branch `docs/foundation-spec` from `main` (`a2cfd8e`) in a worktree
- **Status:** completed — both specs Draft, blocked only on the approvals listed in their compliance reports

## Goal

Design the shared primitives (backend and frontend) that the seven planned modules reuse, with #38 as the acceptance oracle; route the owner's new request for Google/Facebook sign-in into its own specification.

## Steps

1. Context: backlog E02–E05, brief Scope and Key flows, club spec architecture, reuse map, data models and DD rows, engineering standards S3/S4, the empty `@vereino/*` packages.
2. Skeleton with the gate: Q1–Q5 blocking (split, extraction rule, home for framework-bound primitives, 1.0 cut, member UI layer), Q6–Q7 by default; F1–F16 functionality kinds; P-01…P-19 inventory. Hard stop; the owner accepted every recommendation.
3. Second gate for social sign-in after checking the installed packages: core `auth` has no OAuth; the only SSO is the commercial enterprise module (`enterprise/src/modules/sso`), which the lesson forbids; Google is OIDC, Facebook is OAuth 2.0. Q8–Q11 blocking; the owner accepted the recommendations.
4. Research: API digest (commands, entities, events, DI, ACL/setup, scheduler/progress, routes, UI, page metadata) and open-source leaders (MikroORM, CASL, Odoo, Casbin, Keycloak, Auth.js, Django, Supabase, Baserow, NocoDB, Mailchimp, listmonk, shadcn, Medusa v2). Own spot-checks: `AuthService.createSession` + `signJwt` in `autologin.ts`, `auth.users.update { roles }`, `auth.login:form` injection spot.
5. Full design written (REQ-F01…F16, DD-F01…F13, P-01…P-20, phases A–D, TEST-F01…F15, AC-F01…F16).
6. Reviews. Scope cohesion: split phases C–D into a separate spec. Architectural: Critical — event ids vs the club spec and its `rbacService` row, consent columns, an unapproved system-scope e-mail match at sign-in, `scheduler`/`progress` not enabled; High — P-07 writing `people_persons`, three vocabularies for scope/acting role, undefined undo semantics, missing failure modes; Medium — `role_catalogue_mismatch` 500 with a code, `V-` numbering collision, REQ-040 not existing, compatibility wording; Low — thin P-16/P-17, lint false positives. All applied; the split and the DD-35 extension went to the owner as Q14 and Q13.
7. Owner: Q14 yes (split), Q13 yes (DD-35 extension). Done in this run: `2026-10-27-vereino-social-sign-in.md` (REQ-S01…S04, DD-S01…S06, J-S01…S03, TEST-S01…S04, AC-S01…S04, Q-S01…S05, V-S01…S04, phases 1–2); the foundation spec trimmed to phases A–B (P-01…P-19) with Q13/Q14 resolved; decision record `D-027-social-sign-in.md`; brief D27 row and the 1.0 scope sentence; club spec REQ-040, AC-040, TEST-056, the traceability row, DD-35 extended, the events row corrected to `auth.users.update`; `AGENTS.md` system-scope exception extended.
8. Scripted id audits on both specs; PR #40 opened through `om-open-pr`.
9. Third review round on the owner's request ("znajdź niespójne albo wzajemnie wykluczające się rozwiązania … antywzorce i niepotrzebną złożoność"): two fresh-context reviewers (contradictions; anti-patterns and complexity), their key claims spot-checked in the installed packages (`widgets/injection` discovery by the CLI scanner, `ModuleConfigService` in `configs`, the undecorated `WmsScopedEntity`, the `packages/db` and `packages/ui` manifests). 24 contradictions and 14 anti-pattern items reported; the owner asked to apply them ("Nanieś rekomendowane poprawki i uproszczenia").
10. Applied to the foundation spec: `defineScopedCommand` → `prepareScoped` + `assertInScope` on the platform `CommandHandler`, with a scope source for tokens and markers (DD-F14); `Scope` as a list of grants with least-privileged-first acting role and a `self_user` grant (DD-F03, DD-F08); `PublicBlocks` → injection spots (DD-F15); `defineClubSettings` removed, settings stay in `club_core` on `club_core_club_settings` (DD-F16 — the reviewer's `ModuleConfigService` alternative was rejected because it contradicts the club spec's DD-02); P-13 removed; P-11 and P-12 deferred to their second consumer; the custom lint rule → review-checklist line + boundaries rule; the entity base as an undecorated abstract class with exact MikroORM pins (DD-F17); the account-age policy applied and its code thrown by `people`; P-02 repeat = 409/no-op; `seedRoles` from `people`'s setup; phase A split into A1/A2 with E02-S01 and `scheduler` as A1 dependencies and `progress` in B; one BC regime; one test location; counts corrected; V-F05 for the `packages/ui` test approach. Applied to the social spec: nonce and per-subject rate limit dropped (DD-S04); `linked_by`/`email_verified_at_link` dropped; `start` gated by `foundation.identity.self`; subject conflicts end in the generic outcome; two logged-only codes became fingerprints; commands on `prepareScoped` with `self_user`; module-level paths.

## Decisions

- No e-mail matching at sign-in: linking only from a signed-in profile session or by the administrator — removes a tenant-blind read of `auth:user` and the wrong-person risk; the cost is one "Connect" click per user.
- Role sync writes through `auth.users.update`: `rbacService` exposes no grant/revoke and `syncUserRoles` is private; the club spec's events row corrected in this PR.
- Consent columns stay exactly as the club spec lists them; grant/withdrawal history lives in `audit_logs`.
- The social sign-in is its own specification: a feature with its own table, routes, permissions, configuration and external reviews, consuming the foundation's P-01, P-02, P-03, P-09 and P-17.
- Helpers, not a framework (third round): the foundation keeps only what the platform lacks; everything the platform already shapes (commands, subscribers, workers, widgets, settings storage) stays the platform's. Settings remain on `club_core_club_settings` per the club spec's DD-02, not on `module_configs`.

## Files changed

- `.ai/specs/2026-10-27-vereino-foundation-primitives.md` — new
- `.ai/specs/2026-10-27-vereino-social-sign-in.md` — new
- `.ai/specs/research/decisions/D-027-social-sign-in.md` — new
- `.ai/specs/product-brief.md` — D27 row, the 1.0 scope sentence
- `.ai/specs/2026-10-20-vereino-club-management.md` — REQ-040, AC-040, TEST-056, traceability row, DD-35, events row, Changelog
- `AGENTS.md` — the system-scope exception names the identity lookup
- `.ai/runs/2026-10-27-foundation-spec.md` — this log

## Commands and results

- Read-only greps and reads of `packages/app/node_modules/@open-mercato/{core,shared,ui,enterprise}/src/**`, `packages/app/src/modules.ts`, `.ai/specs/*.md`.
- Scripted id audits (`node` over each spec): foundation — 15/15 REQ-F traced (REQ-F15 moved), 12/12 tests, 15 AC, all template sections, 0 `TODO`; social — 4/4 REQ-S, 4/4 tests, 4 AC, all template sections, 0 `TODO`; club spec — 40/40 REQ traced, 56/56 tests, 40 AC.
- `yarn verify` not run: Markdown under `.ai/` and one `AGENTS.md` sentence; the AGENTS.md harness (`yarn harness:validate`) was not run either — the change adds one sentence to an existing rule line; CI runs the gate.

## Open problems

- Both specs stay Draft until the owner's approval on the PR; the foundation spec also waits for approval to enable `scheduler` and `progress`; the social spec for the `arctic` dependency (S16.1 evidence) and V-S04.
- The `AGENTS.md` extraction-rule amendment (foundation REQ-F16) lands with phase A step 1, not here.

## Next steps

- Review and approve the PR; set each spec `Ready for implementation` when its remaining approvals are given; then `om-auto-fix-issue 38` builds phase A with #38.

## Lessons recorded

none
