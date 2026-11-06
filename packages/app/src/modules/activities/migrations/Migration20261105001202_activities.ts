import { Migration } from '@mikro-orm/migrations'

// The gathering time of a session (club spec DD-43, #136): the series default on the activity and each session's own
// offset, in minutes before the start. Nullable, no backfill: existing sessions have no gathering time.
export class Migration20261105001202_activities extends Migration {
  override name = 'Migration20261105001202'

  override up(): void | Promise<void> {
    this.addSql(`alter table "activities_activities" add "gathering_minutes_before" int null;`)
    this.addSql(`alter table "activities_occurrences" add "gathering_minutes_before" int null;`)
  }

  // Written by hand: dropping the columns forgets every gathering time; nothing else reads them.
  override down(): void | Promise<void> {
    this.addSql(`alter table "activities_occurrences" drop column if exists "gathering_minutes_before";`)
    this.addSql(`alter table "activities_activities" drop column if exists "gathering_minutes_before";`)
  }
}
