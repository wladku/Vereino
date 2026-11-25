# Run log — issue #590: a failing occupancy provider (AC-G03, TEST-G04)

- **Trigger:** Cezar run fdd9eef4 (`om-auto-fix-issue`), queued by the `cezar` label on #590.
- **Issue:** #590 (epic #565). **Spec:** `.ai/specs/implemented/2026-10-27-vereino-foundation-scheduling-primitives.md` — AC-G03, TEST-G04.
- **Branch:** `test/issue-590-occupancy-provider-failure`.
- **Route:** `direct` (missing integration test for behaviour that exists; no product code changes).

## Steps

1. Claimed #590 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the behaviour: `activities/services/schedule.ts` `findConflicts` — `mode: 'save'` rethrows a provider error as a plain `Error('activities.occupancy.provider_failed')`, `mode: 'preview'` sets `providerFailed`; the token is resolved through `occupancyProvider(container)` (`hasRegistration`).
3. The running app always registers the provider (`facilities/di.ts`), so the fault hook is a QA-only probe process, following `groups-usage-probe` and `facilities-charge-probe`: `_fixtures/occupancy-provider-probe/probe.mjs` adds a DI registrar that registers a throwing provider or hides the token, compiles the preview and create routes with `compileAppSourceFile` (as the messaging probe's `routeGet`) and calls `POST` with the coordinator's bearer token. Runner: `runOccupancyProviderProbe` in `_fixtures/activities.ts`.
4. New test `foundation/TEST-G04-occupancy-provider-failure.spec.ts`: a closure on the pitch; with the real provider the preview lists it and the save answers 409; with a throwing provider the preview answers 200 with `providerFailed: true` and the save 500 `INTERNAL_ERROR` (no business code) after one provider call; with no provider the preview has no conflict and the save creates the session. The club ends with exactly the absent-provider activity and session, so the failing save wrote nothing.
5. Spec: AC-G03 ticked with evidence; changelog file `changelog/2026-10-27-vereino-foundation-scheduling-primitives/2026-11-22-issue-590-ac-g03.md`. The status line is left as written (AGENTS.md *Spec status line*).
6. Lesson `probe-compiled-crud-route-registers-commands-twice`.

## Decisions

- **Probe, not an app-side switch:** the issue requires a test-only fault hook; an env flag or DI override inside `src/` would ship in production. The probe only changes its own process.
- **"Uncoded 500" asserted as `INTERNAL_ERROR`:** `makeCrudRoute` maps an error without status to 500 with the platform's generic `INTERNAL_ERROR`; no `activities` business code appears. The probe also counts provider calls, so an unrelated 500 cannot pass.
- **The preview's warning is asserted on the API (`providerFailed`)**, the field `PreviewPanel.tsx` renders; a browser check of the panel would need the server-side fault and is not part of this test.

## Commands and results

- `yarn test:integration:vereino --filter TEST-G04`, first runs failed:
  - `Error: Duplicate command registration for id activities.occurrences.update` — the compiled CRUD route re-registers the module's commands (fixed by letting a registration replace the bootstrapped handler while the probe runs).
  - With the registry restored after import the save still answered `{"registered":null,"calls":0,"status":500,"code":"INTERNAL_ERROR"}` — the lazy command load on the first write hit the same duplicate; the wrap now lasts for the process (lesson).
  - `expect(received).toEqual(expected)` on "nothing written" — the check ran after the absent-provider save; replaced by the club's activity and session lists.
- Final: `yarn test:integration:vereino --filter TEST-G04` → `1 passed (36.5s)`.
- `yarn lessons:check` → "Lessons catalog is valid".
- `yarn verify` → see the PR body.

## Open problems / next steps

- None for AC-G03. The phase's *Implementation status* line still names TEST-G04 as left; it is shared with #589 and #591 and is left for the spec's close-out.
