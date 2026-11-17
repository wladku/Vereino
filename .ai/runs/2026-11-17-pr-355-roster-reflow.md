# Run: PR #355 — the roster tab is wider than 320 px on CI (om-auto-fix-pr)

- **Goal and trigger:** cezar task `om-auto-fix-pr 355`. The PR carried `merge-train-failed`: the required check
  `integration (shard 3/3)` failed on TEST-A04 in three CI runs in a row (44101652763, 44116186772, 44127175026).
- **Spec / issue / branch:** parity spec phase 2 (REQ-A03); #267; `feat/issue-267-coordinator-corrects-roster-mistake`,
  worked on a detached HEAD at its origin tip and pushed with `git push origin HEAD:<branch>` (no force-push).

## Steps

1. Claimed the PR (assignee, `in-progress`, 🤖 claim comment). The branch already contained `origin/main` (3252cf4f),
   so there was no base merge to do.
2. CI log: `Error: page wider than 320 px by 16 px` at `expectNoPageOverflow` (TEST-A04, after the pl or en loop).
3. Local run of TEST-A04 with a temporary probe at 320 px: passed. Windows fonts are narrower than the fonts on the
   Linux runner, and the probe listed only table cells, which scroll inside the table's own container.
4. Second probe at a 290 px viewport, listing only elements with no clipping or scrolling ancestor: one element, the
   pl pagination page info `Wyświetlanie 1 do 2 z 2 wyników w 326ms` (platform `Pagination`, `shrink-0`, 261 px).
5. Fix: `showQueryTime={false}` on the roster `DataTable` in `RosterPanel.tsx`. Re-run with the 290 px probe: no
   element passed the viewport in en or pl; the test passed. The probe was then removed (the test file is unchanged).
6. Lesson `datatable-query-time-overflows-320-px`. Committed and pushed as 52ffecae.
7. Review (a subagent following the `om-code-review` checklist, read-only): request changes, one blocking finding.
   `groups.memberships.end` never ran the overlap check. The PR's free last-day picker and its "End instead" fallback,
   offered also on History rows, made that reachable: a last day past a later membership of the same person and
   role, or an ended row moved forward to today. Fix:
   - the end command runs `assertNoOverlap` and `flushMembership`, like create, update and undo; the end route's
     `openApi` lists 409 `membership_overlap`;
   - "End instead" is offered only for an active row; an ended row in use gets the coded error;
   - TEST-A03 gains the case "an end into an overlap answers 409 and changes nothing".
8. The non-blocking findings (coordinator-scope tests, the usage query that grows with every attendance row, two
   list parameters ignored on `sortField=roster`, two a11y nits, a helper only used by tests) were filed as #359.

## Decisions

- End is not made to refuse a later last day. Whether End may extend a membership is a product question; the overlap
  check alone is enough to stop the data harm. The new 409 on the end route is the same refusal that create and update
  already return, so the owner-approved contract of #252 is only tightened, not widened.

- The query time is turned off rather than wrapping the footer in a scroller: a club roster does not need a query
  timer, and a scrolling footer would hide the page info. `showQueryTime` is a public `DataTable` prop, so nothing in
  the platform is patched, and the test is not weakened.

## Commands and results

- `yarn test:integration:vereino --filter TEST-A04` (probe 320 px, before the fix) — 1 passed (Windows fonts).
- Same, probe 290 px, before the fix — 1 passed; probe: `DIV.shrink-0 text-sm text-muted-foreground tabular-nums
  right=298 w=261 text=Wyświetlanie 1 do 2 z 2 wyników w 326ms` (pl).
- Same, probe 290 px, after the fix — 1 passed (4.2 min); probe empty in en and pl.
- `yarn verify` — all 17 steps passed (before the review fix).
- `yarn test:integration:vereino --filter TEST-A03` (with the overlap case) — 1 passed (3.1 min).
- `yarn verify` after the review fix — all 17 steps passed.

## Open problems

- Other `DataTable` hosts on padded record tabs may carry the same risk in Polish; none fails today.

## Next steps

- CI on the pushed head; the merge train picks the PR up again once the required checks are green.
