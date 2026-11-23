# Issue #582 — record the ENG-TEST-17 Lighthouse baseline

- **Date:** 2026-11-23
- **Agent / tool:** Claude Code (Opus 5.5) via Cezar, `om-auto-fix-issue` (repo-local override)
- **Trigger:** `cezar` label on issue #582 (queued by the owner)
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (ENG-AC-14, ENG-TEST-17, E1 checklist item (b)); #582; `docs/issue-582-record-lighthouse-baseline`
- **Status:** done — documentation only

## Goal

Record the scores of a recent `main` `perf` run as the ENG-TEST-17 baseline where the spec says ("baseline recorded in the E1 run log") and cite it next to ENG-AC-14.

## Steps

1. Claimed #582 (assignee, `in-progress`, `🤖` claim comment).
2. Listed `ci.yml` runs on `main`; picked the newest completed green run, 45131377056 (`4456442e`), whose `perf` job succeeded and whose `lighthouse-results` artifact had not expired.
3. Downloaded the artifact with `gh run download` and read the three `lhr-*.json` reports (categories and the FCP, LCP, TBT, CLS, Speed Index and TTI audits); cross-checked with run 45123362726 (`93336b54`).
4. Wrote the baseline section into `.ai/runs/2026-10-21-e1-gate-and-ci.md`, ticked ENG-AC-14 with the citation, updated E1 checklist item (b) and the compliance line, added the spec changelog file.

## Decisions

- Baseline = the median run by performance score (Lighthouse CI's representative run), with the range over the three runs alongside: the first run of each job is a cold start (performance 53–54, TBT ≈ 1.6–1.9 s) and would understate the page.
- ENG-AC-14 is ticked: ENG-TEST-16 already passes in CI with zero critical/serious violations (its baseline per the ENG-TEST-16 row), and ENG-TEST-17 now has its recorded baseline. No threshold or assertion was added to the advisory `perf` job (out of scope; would change CI behaviour).

## Files changed

- `.ai/runs/2026-10-21-e1-gate-and-ci.md` — new section *ENG-TEST-17 Lighthouse baseline*
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` — ENG-AC-14 ticked with citation; checklist (b) and compliance line no longer list #582 as open
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-23-issue-582-lighthouse-baseline.md`
- this log

## Commands and results

- `gh run download 45131377056 -n lighthouse-results` → 3 reports, Lighthouse 12.6.1, mobile; performance 54 / 82 / 83, accessibility 100, best practices 96, SEO 100 in all three.
- `gh run download 45123362726 -n lighthouse-results` → performance 53 / 82 / 83, the other categories identical.
- `yarn verify` → all 21 steps passed.

## Open problems

None. ENG-TEST-02 (#576) still keeps E1 checklist item (b) open.

## Next steps

None for #582.
