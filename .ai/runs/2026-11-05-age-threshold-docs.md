# Own-account age threshold: one rule in every document (#135)

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue`, cezar worktree `4a57d443`
- **Trigger:** cezar task "135"; the owner answered the blocking question on 2026-11-04 (keep the default 16, the example club keeps 13, say so everywhere).
- **Issue / branch:** #135, `fix/issue-135-age-threshold-docs` from `main` at 07ced5f
- **Status:** completed, PR open for review.

## Goal

The product brief, the UX concept and the club management spec name the same default own-account age (16, R10/D22) and the same reason for the example club's 13.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no PR closing #135 (#161 only `Refs` it). Claimed the issue (assignee, `in-progress`, `🤖` comment).
2. Triage: the contradiction is real on `main` — brief D04 "own login from 13" still `active`; README section 1 "Participant 13+", F-01 "threshold (13)" without a reason; the mockup's B-02 hint cites D-004 and a pending legal confirmation (Q-007 is closed, the opinion waived).
3. Brief: D04 → `superseded by D22: the age is a club setting, default 16 (R10)`; D22's Supersedes column names D04; one note under the Business rules table saying the default stays 16 and Dev Academy lowers it to 13 for Ola, 14.
4. README: the participant persona, F-01's precondition and branch, and B-02's feature line now name the default 16 and the example club's 13 with the reason; B-02's range links #87.
5. Mockups: `b.screenSettings.minAgeHint` (en, pl) now reads "13–18; default 16 (D-022)"; `i18n.js` rebuilt with `node docs/ux-concept/mockups/build.mjs`.
6. Club spec: unchanged. REQ-002 and DD-37 already say 16, and J-001 step 1 already says why Dev Academy uses 13 ("lowers the default 16 to 13, so that Ola below can have an account"); the *Tests* intro says the same for the fixtures.

## Decisions

- The validator range (13–18 vs 1–18) stays with #87: its Q1 is answered on that ticket (13–18, comment of 2026-11-04) and implemented in PR #161. The spec's data model still says 1–18; #161 owns that change.
- The mockup's sample club (`minAge: 13`, still named Gwiazda) is left as is: its 13 matches the example club's value.

## Commands and results

- `node docs/ux-concept/mockups/build.mjs`: en 2041 keys, pl 2041 keys; only the hint line changed in `i18n.js`.
- `yarn verify`: all 13 steps passed (generate, typecheck ×3, lint, format:check, ds:check, i18n:check-hardcoded, contracts:check, lessons:check, test, test:scripts, build).

## Open problems

- R03 and D06 in the brief still say "a ward aged 13+" declares attendance; with the default 16 a 13–15-year-old has no account. Not in #135's scope; worth a follow-up if the owner wants the wording to follow R10.
