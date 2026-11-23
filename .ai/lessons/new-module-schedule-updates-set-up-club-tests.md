---
title: "A new per-club schedule changes set-up-club output: update the older tests that assert it exactly"
modules: ["activities", "payments", "facilities", "people"]
areas: ["module-data", "testing"]
topics: ["scheduled-jobs", "integration-tests", "set-up-club"]
---

# A new per-club schedule changes set-up-club output: update the older tests that assert it exactly

**Context**: #525 added a daily purge schedule to `activities`, `payments` and `facilities`. Each module's
`setUpClub…` returns a `schedules` object that the operator command `<module> set-up-club` prints, and older
integration tests compare it (and the club's `scheduled_jobs` names) with `toEqual`: `ISSUE-221` (facilities, with a
`JOB_NAMES` list) and `TEST-C14` (payments, "four schedules"). `ISSUE-192` and `TEST-A20` use `toMatchObject` and need
no change.

**Problem**: The new key and the new `scheduled_jobs` row break the exact assertions only in the integration suite,
which the gate does not run; the typecheck and unit tests stay green.

**Rule**: When a module registers a new schedule in its club setup, grep `packages/app/.ai/qa/tests` for
`'<module>', 'set-up-club'` and for `<module>:` job-name lists, update every exact assertion (and its "N schedules"
wording), and run those tests locally in the same PR. Since #629 a per-club job is declared in the module's
`lib/club-jobs.ts` (`dailyAt` local `HH:MM` or `everyMinutes`), set up through the foundation's `setUpClubJob` and
wrapped in `clubJobWorker`; the foundation moves daily jobs on a time-zone change, so no module subscriber is needed.
A new job type also adds a sweep schedule: update the counts in `foundation/ISSUE-629-retire-club-schedules.spec.ts` (`SWEEP_SCHEDULES`, `CLUB_JOBS`).

**Applies to**: `packages/app/src/modules/*/services/club-setup.ts`, `*/cli.ts` `set-up-club`, the integration tests
under `packages/app/.ai/qa/tests/{activities,payments,facilities,people}`.
