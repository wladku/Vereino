# Foundation II spec — scheduling, attendance and roster primitives

- **Date:** 2026-10-27
- **Agent / tool:** Claude Code (Fable 5.1), `om-spec-writing` (interactive) with five read-only subagents (V-8b schedule family, V-6/V-F06/V-F07 platform seams, V-14 web check, then two fresh-context reviews: contradictions and scope, anti-patterns and platform fit); then `om-open-pr`
- **Trigger:** product owner — "Chcę stworzyć specyfikację na podstawie issue #22 … żeby powstał nie tylko sam feature, ale też framework pod spodem …", then the gate answers ("Przyjmij rekomendacje Q1–Q8 … oraz domyślne Q9–Q10")
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md`; issue #22 (E03) with stories #30–#34 as consumers; branch `docs/foundation-ii-spec` stacked on `docs/foundation-spec` (PR #40), because both amend the club spec
- **Status:** completed — the spec is Draft, blocked only on the owner's approval on the PR; the club spec's phase 2 marked ready in the same PR

## Goal

Design the second slice of the foundation — recurrence, forward-only statuses, conflicts, audited reads, module schedules, calendars — with E03 as the consumer, and mark the club spec's phase 2 ready after its verifications.

## Steps

1. Context: E03 stories, the club spec's phase 2 (deliverables, steps, V-6/V-8/V-14), the `groups`/`activities` data models and API rows, DD-10/11/12/20/26, J-002, TEST-007…014, the foundation I deferrals (P-11, P-12, P-21…P-24).
2. Installed-package checks before the gate: the schedule family exists in `@open-mercato/ui`; `rrule` is not installed but `date-fns`/`date-fns-tz` are.
3. Skeleton with the gate (Q1–Q8 blocking, Q9–Q10 default); G1–G13 functionality kinds; the candidate inventory. Hard stop; the owner accepted every recommendation.
4. Verifications by subagents, spot-checked: V-6 confirmed (upsert on stable id, 100 schedules per tenant, sanitised payloads, worker id ownership); V-8b partial (the family's API, provider needs, no actions/done state/mobile handling); V-14 negative (HTML only, captcha-gated API, terms forbid extraction); V-F06 confirmed (`date-fns-tz` 3.2.0 direct dep of the app, not of `@vereino/core`); V-F07 confirmed (notification types array + `notificationService`; dictionaries seeded with `em`).
5. Full design (REQ-G01…G08, DD-G01…G13, P-11/P-12/P-22…P-28, phases A–B, TEST-G01…G07).
6. Reviews: 20 contradiction/scope items (critical: the session table vs the club spec's reopen rule; `advanceWhere` stated three ways) and 12 anti-pattern items (critical: `auditedRead` unimplementable on the platform access log — V-F08 found an 8-hour retention for non-core rows; `CalendarList` on `ScheduleAgenda` could not show actions or the done state). All applied: the audit log is a module-owned append-only table (which makes #34 the first consumer of `AppendOnlyEntityBase`, built now), `CalendarList` is a Tailwind list, `advanceWhere` runs inside a module command, `reopen` added, one signature per helper, `defineScheduledJob` narrowed to `registerModuleSchedule` + a worker convention, ORM/DI helpers in `foundation/services/`, uncoded 500 for a failing provider, error-code ownership, the place-tree projection rule, DD-20 superseded in part, the club spec's notification id, the horizon constant kept, counts and phase/traceability alignment.
7. Club spec phase 2 readiness amendment on this branch; id audit of the spec (8/8 REQ-G, 7/7 tests, 8 AC, 14 DD-G); PR opened through `om-open-pr`.

## Decisions

- Own RRULE subset on `date-fns`/`date-fns-tz` (DD-G01) — supersedes the club spec's DD-11; no new dependency.
- The durable audit record is the module's append-only log; the platform access log is a mirror (DD-G06) — because of its retention rules, not by preference.
- The installed schedule family serves the coordinator calendar only; members get a Tailwind list (DD-G08).
- Consumer wiring is the stories' work; this spec delivers primitives, tests and "consumer evidence".
- The PR is stacked on #40 (both change the club spec); it merges after #40.

## Files changed

- `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` — new
- `.ai/specs/2026-10-20-vereino-club-management.md` — phase 2 readiness: status line, *Phase readiness* row, step 1, V-6/V-8/V-14 results, DD-11 and DD-20 notes, `activities:flag-unsettled` → list predicate, `activities_contact_access_log` row, REQ-039 re-scope, verdict, Changelog
- `.ai/runs/2026-10-27-foundation-ii-spec.md` — this log

## Commands and results

- Read-only greps and reads of `packages/app/node_modules/@open-mercato/{ui,scheduler,core,shared}/src/**`, `packages/app/package.json`, `packages/core/package.json`; web fetches of laczynaspilka.pl and the PZPN regulamin by the V-14 subagent.
- Scripted id audit of the new spec: clean. The club spec's audit after the amendment: see the PR.
- `yarn verify` not run: Markdown under `.ai/` only.

## Open problems

- The owner's approval on the PR; `date-fns`/`date-fns-tz` declarations in `@vereino/core` and `dictionaries` enabling are Ask First items of phase A step 1.
- REQ-039 (fixtures) is now a manual import; a formal PZPN data licence is the only route to automation.

## Next steps

- Merge #40, then this PR; implement foundation I phase A1 with #38, then foundation II phase A with #31.

## Lessons recorded

none
