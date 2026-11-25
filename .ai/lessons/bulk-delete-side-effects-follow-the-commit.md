---
title: "A bulk deletion takes its side effects from the rows it deleted, and runs them after the commit"
modules: ["club_core", "scheduler", "attachments", "auth"]
areas: ["module-data"]
topics: ["deletion", "transaction", "scheduler", "bullmq", "attachments", "nullable-tenant"]
---

# A bulk deletion takes its side effects from the rows it deleted, and runs them after the commit

**Context**: `club_core delete-club` (#632, PR #677) unregistered the club's schedules before its transaction and read
the attachment rows before it too. The #677 review found that a failed transaction left a live club without
schedules, and that a file uploaded between the read and the delete stayed in storage. The fix (#681) moved both into
the transaction: `delete … returning`. That raised a second problem. The scheduler's `schedulerService.unregister(id)`
looks the `scheduled_jobs` row up first and does nothing when the row is gone, so it cannot run after the commit.
The same review found that `user_consents`, `user_sidebar_preferences` and `sidebar_variants` have a nullable
`tenant_id`. A row there without a tenant escapes a `tenant_id = ?` delete. `user_sidebar_preferences` references
`users` without a cascade, so such a row also blocks the delete of `users`.

**Problem**: A side effect that cannot be rolled back (a queue job, a stored file) done before a transaction commits
outlives a failed transaction. Rows read before the transaction miss the rows written meanwhile. A platform
"unregister by id" helper often re-reads the row, so it silently does nothing once a raw SQL delete has removed it.

**Rule**: In a bulk deletion, delete the rows inside the transaction with `returning` the columns the side effects
need. After the commit, run the side effects from those rows: storage deletes, cache clears, and for schedules
`bullmqSchedulerService.unregister(id)`. That service is registered only with `QUEUE_STRATEGY=async`; the local
strategy polls the table and needs nothing. Count failures (`schedulesFailed`, `filesFailed`) instead of throwing.
Before selecting a platform table by `tenant_id` only, check the column's nullability in the installed entities. For
a user-owned table whose `tenant_id` is nullable, also select the tenant-less rows of the club's users
(`tenant_or_user` in `club_core/lib/club-offboarding.ts`).

**Applies to**: `club_core/services/club-offboarding.ts` (`deleteClub`, `restoreClub`), `PLATFORM_CLUB_TABLES`, and
any future command that deletes rows owning schedules, files or cache entries.
