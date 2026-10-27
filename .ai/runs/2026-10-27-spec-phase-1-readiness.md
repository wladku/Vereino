# Club management spec — phase 1 readiness

- **Date:** 2026-10-27
- **Agent / tool:** Claude Code (Fable 5.1), `om-spec-writing` in review mode with four read-only subagents (one fresh-context readiness audit, three contract verifications), then `om-open-pr`
- **Trigger:** product owner — after `om-auto-fix-issue 38` stopped on the Draft status: "Wprowadź gotowość per faza (poprawka DD-01), wykonaj weryfikacje V-1, V-2, V-3, V-10, V-11, V-12 na zainstalowanych pakietach, popraw małe luki bez decyzji (wiersz case_immutable, flagi held-back, referencje), oznacz fazę 1 jako Ready i otwórz PR."
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md`; unblocks #26, #27, #38 (phase 1 stories); branch `docs/spec-phase-1-ready` from `main` (`c2867a5`) in a worktree
- **Status:** completed

## Goal

Make phase 1 (`club_core` + `people`) implementable without signing off phases 2–5, which still wait for their verifications, the held-back reviews (A02, A05) and the owner decisions of the architectural review of 2026-10-26.

## Steps

1. Readiness audit before any edit (previous turn, same day): scripted check of ids (39/39 REQ with phase, test and AC; 55 tests defined and referenced; 22 blocking questions resolved; every phase complete) plus a fresh-context subagent audit. Result: the document failed its own Final Compliance Report (three `fail` rows, verdict `Blocked`), mostly on unexecuted contract verifications and missing approval, with a few no-decision gaps.
2. Owner chose per-phase readiness over a whole-document flip or waiting for the architectural-review decisions.
3. Contract verifications of phase 1 run read-only against `packages/app/node_modules/@open-mercato/*` 0.9.0 by three subagents, spot-checked by the coordinator in the sources (`auth/commands/users.ts`, `src/app/(frontend)/[...slug]/page.tsx`, `src/app/api/[...slug]/route.ts`, `shared/src/lib/i18n/server.ts`, `directory/api/get/organizations/lookup.ts`, example `references/surface-map.md`): V-1, V-2, V-3 confirmed; V-10, V-11, V-12 partially confirmed, each resolved with the fallback its row already named (and which the design already assumed).
4. Spec edits in the worktree: DD-01 amendment; *Phase readiness* table; status line; phase 1 step 1; V rows; `case_immutable` API row; held-back flags; installed references; blanket mockup rule; compliance rows and verdict split per phase; Changelog row.
5. Scripted audit re-run on the edited file; diff reviewed; PR opened through `om-open-pr`.

## Decisions

- Per-phase readiness instead of one status — the single status blocked phase 1 on verifications and decisions that belong to phases 2–5; DD-01 records it.
- The top-level status line starts with `Ready for implementation` and names the scope, so the implementation skills' readiness audit reads it as ready while the *Phase readiness* table keeps phases 2–5 at Draft and the phase gate ("only a ready phase whose dependencies are verified") stops them.
- V-10/V-11/V-12 fallbacks use installed primitives (`checkAuthRateLimit` / `rateLimiterService`, `loadDictionary` + `createFallbackTranslator`, a DD-35 lookup mirroring `directory`'s `lookup.ts`) rather than own counters or resolvers.
- The Critical and High findings of the architectural review of 2026-10-26 were not touched: they sit in phases 3–5 or need owner decisions (DD-01 split, DD-19).

## Files changed

- `.ai/specs/2026-10-20-vereino-club-management.md`
- `.ai/runs/2026-10-27-spec-phase-1-readiness.md` (this log)

## Commands and results

- Scripted readiness audit (`node` script over the spec): before and after the edit, 39/39 requirements traced with phase, test and AC; 55/55 tests defined and referenced; 0 unresolved blocking questions; 5/5 phases with every required field; 0 `TODO`/`TBD`.
- `yarn verify` not run: the diff is two Markdown files under `.ai/`, which no gate step covers; CI runs the gate on the PR.

## Open problems

- Architectural review of 2026-10-26: 1 Critical (link-token emails vs S4.6, phase 3) and 10 High unfixed; owner decisions DD-01 split and DD-19 pending. Recorded in the *Phase readiness* table as gate evidence for phases 3 and 5.
- `scheduler` enabling still needs approval in phase 1 step 1.
- Not applied from the fresh-context audit (acceptable gaps, noted for a later revision): per-row concurrency notes for `declare`, `checkout`, `submit_request`; scope notes on `attendance-policies`, `fees`, `settings`; option-source routes absent from the API table.

## Next steps

- `om-auto-fix-issue 38` (or 26 first — #27 and #38 depend on it) once this PR merges.

## Lessons recorded

none
