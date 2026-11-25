# Run: issue #707 — E20-S03 counts status tags while the charges list refetches

- **Trigger:** cezar task for issue #707 (`bug`, `priority-low`, `risk-low`, label `cezar`), queued by the owner's backlog check on 2026-11-25 ("Test-only fix as suggested above").
- **Issue:** #707, follow-up from PR #705 (CI run 45559952973, shard 4/6: `Expected: >= 4, Received: 0` at `E20-S03-status-word-and-icon.spec.ts:38`).
- **Branch:** `test/issue-707-e20-s03-poll-status-tags` (cezar worktree `564dc856`).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the worktree, branch and start time).
2. Read the helper `expectWordAndIcon`: it waits for `tags.first()` to be visible, then reads `tags.count()` once. `count()` does not retry, so a refetch between the two reads 0.
3. Fix: the count is read through `expect.poll(...).toBeGreaterThanOrEqual(minimum)` and the loop iterates over the value the poll saw (a second bare `count()` could again read 0 and make the loop check nothing).
4. Added lesson `count-list-items-with-expect-poll`.

## Decisions

- Test-only, as the issue and the owner's comment scope it. The likely cause of the refetch is product-side: `ChargesTable` (`payments/components/ChargesTable.tsx`) keys its query on `useOrganizationScopeVersion()` without `placeholderData: keepPreviousData`, the same pattern #704 fixed in the activities occurrences list (lesson `datatable-row-menu-detaches-on-rerender`). Not changed here; named in the PR as a possible follow-up.

## Files changed

- `packages/app/.ai/qa/tests/payments/E20-S03-status-word-and-icon.spec.ts`
- `.ai/lessons/count-list-items-with-expect-poll.md`
- `.ai/runs/2026-11-25-issue-707-e20-s03-poll-status-tags.md`

## Commands and results

- `yarn lessons:check` → `Lessons catalog is valid`.
- `yarn test:integration:vereino --filter E20-S03` (build + run 1) → `1 passed` (test 13.4 s).
- `yarn test:integration:vereino --filter E20-S03 --no-build`, runs 2–3 → `1 passed` each.
- `yarn verify` → `all 22 step(s) passed`.
- `yarn guard` → `No blocking findings.`

## Open problems / next steps

- Possible follow-up (not filed by this run): keep `ChargesTable` rows during a refetch with `placeholderData: keepPreviousData`, as #704 did for the occurrences list, so the list does not flash empty when the organization scope version changes after page load.
