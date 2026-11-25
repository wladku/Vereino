# Run: issue #598 — AC-L05 browser evidence for the coach departure cash link

- **Goal / trigger:** cezar task (om-auto-fix-issue) for #598 (label `cezar`). Epic #565, spec `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md` — AC-L05.
- **Branch:** `test/issue-598-coach-departure-refusal-cash-link`.
- **Route:** `testing` + `spec-pr` (test only, `direct`; no spec rewrite).

## Steps

1. Claimed #598 (assignee, `in-progress`, 🤖 claim comment naming the worktree and branch).
2. Read `TEST-L06-coach-departure.spec.ts` and `LeavingPanel.tsx`: the preview on the Leaving tab runs on its own with today as the last day, so the cash blocker and the `people-leaving-cash-link` link show without any input.
3. Added a browser step right after the API refusal (409 `departure_blocked`) and before the cash is accepted: the administrator signs in, opens `?tab=leaving`, sees the blocker naming the coach and `PLN 150.00`, "Confirm leaving" disabled, the link text from the catalog with `href="/backend/payments/cash-custody"`; clicking it opens B-33 with the coach in `custody-person`. `signInBrowser` ends the admin API token, so the test takes a fresh one with `getAuthToken` and stores it in `club.adminToken` (lesson `sign-in-browser-ends-the-api-token`).
4. Ticked AC-L05 in the spec and added the changelog file `2026-11-22-issue-598-cash-link.md`; the status line is left as written (AGENTS.md *Spec status line*).

## Decisions

- The name is matched by surname only: the blocker renders `Odchodzi Rafał` (surname first), the first run failed on `'Rafał Odchodzi'`.
- The amount is matched with `/150[.,]00/` so the step holds in either locale.

## Commands and results

- `yarn test:integration:vereino --filter TEST-L06`, first run: failed — `Expected substring: "Rafał Odchodzi"`, `Received string: "BlocksOdchodzi Rafał: holds PLN 150.00 in cash that is not settled Open Cash to settle"`.
- `yarn test:integration:vereino --filter TEST-L06`, after the fix: 1 passed (50.0 s).
- `yarn spec-changelogs:check`: valid. `yarn qa-texts:check`: 0 problems.
- `yarn verify`: see the PR body.

## Open problems / next steps

None. AC-L05 is met; the spec's other open criteria stay with their own issues.
