# Issue #136: a gathering time on a session, shown to parents and carried in notices

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task 729f8d7e), `om-auto-fix-issue` with the repo-local override applied (feature route; the covering spec is the club management spec, so the addendum lands on the same PR as the build, as the owner asked: "Write the spec addendum first, then build")
- **Trigger:** `/om-auto-fix-issue 136`
- **Branch:** `feat/issue-136-session-gathering-time`, from `main` at 07ced5f
- **Status:** in progress.

## Goal

A session carries an optional gathering time: a default offset on the activity, a per-session override, shown as "Gathering {time}" before the start on the member screens, the attendance list header and the public session page, and carried in the share text and the cancellation e-mail (issue #136; club spec DD-43).

## Steps

1. Claimed #136 (assignee, `in-progress`, claim comment naming this run). FR triage: no gathering field exists anywhere (`grep -ri gather` finds nothing in the modules); no open PR references the issue.
2. Spec addendum: club spec DD-43, glossary, data model, UI contracts, API row and changelog; messaging spec DD-M14 and changelog.
