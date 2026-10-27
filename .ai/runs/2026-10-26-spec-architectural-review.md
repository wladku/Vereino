# Architectural review: Vereino club management spec

- **Date:** 2026-10-26
- **Agent / tool:** Claude Code (Opus 5.5), `om-spec-writing` in review mode, coordinating three read-only subagents
- **Trigger:** product owner — `/om-spec-writing`, answered "architectural review of the club spec"
- **Spec / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` (Draft; identical on `main` after PR #37); no branch, nothing edited
- **Status:** review completed (2026-10-26); the two structural decisions applied as D-028 on 2026-10-27 on branch `docs/spec-split-payments-facilities`; the other findings are unfixed

## Goal

A staff-engineer review of the spec after the two consistency reviews and D-021…D-026: scope cohesion, canonical mechanisms, boundaries, contracts, reversibility, sensitive data, failure modes, testability and bloat. Consistency drift already handled in `.ai/runs/2026-10-23-spec-consistency-review*.md` was out of scope.

## Steps

1. Three subagents, one lens each: (A) scope cohesion, given only the spec path (the skill's rule); (B) canonical mechanisms, boundaries, contracts, placement and transactions against `AGENTS.md`, `BACKWARD_COMPATIBILITY.md`, `architecture.md`, `contracts.md`, `extensions.md` and the engineering standards; (C) reversibility, sensitive data, failure scenarios, testability and bloat.
2. The coordinator re-checked the top findings in the spec (lines 144, 163, 202, 326, 373, 732, 747, 757, 811, 827–831, 854, 864–878, 890, 1033, 1052, 1164), in the standards (S4.6: event payloads carry ids only) and in the module facts (`payment_gateways.payment.refunded` exists).

## Results

| Severity | Count | Headline |
|---|---|---|
| Critical | 1 | link-token emails cannot be built from a SHA-256 hash without putting the token into an event payload (S4.6) |
| High | 10 | the spec is a bundle and the facility module is hard-blocked by held-back phase 4; the D-026 import seam deadlocks in phase 1; `people.scopeService` has undeclared sources and a fail-open treasurer scope; `communication` as an email hub with a dependency cycle; money corrections without a contract (reverse, refunds, late captures, charge generation); import commit and anonymization undefined; occupancy check-then-write race; rollback not real; encrypted names copied into snapshots; DD-19 transaction contract undefined |
| Medium | ~15 | undeclared `requires`; two writers of `auth` state; no event payload or DI signatures; public cache invalidation; required emails not recorded as state; missing marker fields; generator vs facility guard; idempotency keys; series edits; forward-only state machines; parsing and a new XLSX dependency; plaintext child names and free text; retention; untested jobs and steps; no test clock |
| Low | ~6 | `organization_id` in unique keys; consent history; error-code ownership; shared logic for `@vereino/core`; interface ownership; ~250–300 lines of bloat |

Sound: tenant isolation fails closed; one system-scope lookup (DD-35); redacted public calendar; no cross-module ORM relations; optional DI seams fail closed (DD-28, DD-36, DD-38 direction); append-only substitutions; deliberate case immutability; hashed single-use link tokens with uniform 202s; idempotent generation and webhook dedupe; encrypted import staging with purge; an encrypted-column test in every phase.

The full report with lines and fixes was given to the owner in the session (2026-10-26).

## Decisions and reasons

- Nothing was edited: the skill's review mode delivers a report, and several findings are owner decisions (splitting the spec, decoupling facilities from payments).
- Findings already recorded by the two consistency reviews were not repeated.

## Commands and results

- Read-only `grep`/`sed` checks of the cited lines; no gate run (no code or spec change).

## Owner decisions (2026-10-27)

- **DD-01 — split into three specs.** The current file keeps phases 1–3 (phase 1 stays `Ready for implementation`), with the shared vocabulary, roles, `people.scopeService` and DD-35; phases 4 (payments) and 5 (facilities) move to two new specs with their own status. Ids stay global and are not renumbered. This supersedes the per-phase readiness amendment of DD-01 that landed on `main` in PR #39 (2026-10-27).
- **DD-19 — the rental charge becomes an optional service.** `facilities` requires only `activities`; with `payments` enabled the rental charge is created in the same transaction through an optional DI token (`hasRegistration`); without it a rental is a register entry with its amount, and the renter's email carries the amount and the municipality's account. The facility module can then ship before payments.
- **Sequencing:** both are applied together, after the open PR #40 (foundation and social sign-in specs; it edits the same spec and adds D-027) is merged, so the split does not conflict with it. They are recorded as D-028 at that point.

## Applying D-028 (2026-10-27)

3. The owner's first "PR #40 is merged" arrived while GitHub still showed it open; the work waited until `ddc6969` (merge of #40) was on `main`, then branched `docs/spec-split-payments-facilities` from it.
4. `split_spec.py` routed every row by id or route path (REQ, DD, J, TEST from the phase test lists, AC, Q, V; `/api/payments` and `/api/facilities` routes; UI paths; event producers and consumers; vocabulary terms; risks; the two non-goals; the `payments` and `facilities` data-model subsections; phases 4 and 5 and their readiness rows). `assemble.py` built the two new specifications with a shared-context pointer and `N/A — see the club spec` for shared sections, added one pointer line to every club-spec section that lost rows, and applied the DD-19 rewrite. `links.py` updated the brief, the backlog record, the engineering standards and `BACKWARD_COMPATIBILITY.md`.
5. Checks on scratch copies, then again on the written files: the three specifications together define REQ 40, DD 39, AC 40, TEST 56, Q 47, J 10, V 14 with no duplicate, gap or undefined reference, 0 table cell mismatches, every REQ with exactly one traceability row; every line removed from the club spec reappears verbatim in one of the three files except 22 lines edited on purpose (status, sources, module rows, DD-01, DD-19, module boundaries, J-005 steps 2 and 4, the two data-model headings, the rental entity and its create/approve routes, the notification paragraph, the phase 5 readiness row, the phase 4 deliverables, the phase 5 dependency, the REQ-013 traceability row, the rollback bullet, the compliance row and verdict). The owner approved the diff before writing. `yarn format:check`: 31 Vereino files, 0 unformatted.
6. The brief's Coverage was recounted: 139 claims — 118 sourced (document 72), 21 assumed; +2 because the D27 row added by PR #40 had not been counted and D28 is new.

## Files changed

- `.ai/specs/2026-10-20-vereino-club-management.md` — phases 1–3 and the shared parts; DD-01 rewritten; pointers; Changelog row.
- `.ai/specs/2026-10-27-vereino-club-payments.md` — new (phase 4).
- `.ai/specs/2026-10-27-vereino-facilities.md` — new (phase 5, DD-19 rewritten).
- `.ai/specs/research/decisions/D-028-split-specification-and-optional-rental-charge.md` — new.
- `.ai/specs/product-brief.md` — D28 row, sources, *Now* scope, Coverage.
- `.ai/specs/backlog.md` — D-028 note on the design authority of phases 4 and 5.
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, `BACKWARD_COMPATIBILITY.md` — references to the payments specification.
- `.ai/runs/2026-10-26-spec-architectural-review.md` — this log.

Not touched: `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md`, an untracked file another session is writing in this checkout.

## Open problems

- The Critical finding (link-token emails vs ids-only event payloads) and the High findings are unfixed; each now belongs to one of the three specifications.
- The foundation primitives spec still describes "seven modules over five phases" in its TLDR; it is accurate and was left as is.

## Next steps

1. Apply the review's fixes that need no decision, in the specification each belongs to, with Changelog rows; re-run the audit across the three files.
2. Commit this change on `docs/spec-split-payments-facilities` and open a PR when the owner asks.
