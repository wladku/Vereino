import { Migration } from '@mikro-orm/migrations'

// Issue #96 (approved by the owner on 2026-11-05): `activities_activities.is_away` marks an away trip, which the coach
// units report counts and the `away_trip` declaration policy governs (club spec *Data Models*, glossary *Coach
// settlement*). Generated with `yarn db:generate`. A boolean column with a constant default is a metadata-only change
// in PostgreSQL 11+, so no table rewrite; `lock_timeout` bounds the wait for the table lock (S5.4). The previous
// release ignores the column (S14.6).
export class Migration20261107084915_activities extends Migration {
  override name = 'Migration20261107084915'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "activities_activities" add "is_away" boolean not null default false;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "activities_activities" drop column if exists "is_away";`)
  }
}
