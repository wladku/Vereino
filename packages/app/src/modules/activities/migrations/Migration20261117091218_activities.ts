import { Migration } from '@mikro-orm/migrations'

// Migration A of the groups and activities parity spec (REQ-A07, DD-A01, #269; approved on #252 on 2026-11-16): the
// declaration deadline as the series default on the activity and each session's own offset, in minutes before the
// start. Nullable, no backfill: existing sessions have no deadline, and the previous release ignores the columns.
export class Migration20261117091218_activities extends Migration {
  override name = 'Migration20261117091218'

  override up(): void | Promise<void> {
    this.addSql(`alter table "activities_activities" add "confirm_by_minutes_before" int null;`)
    this.addSql(`alter table "activities_occurrences" add "confirm_by_minutes_before" int null;`)
  }

  // Written by hand: dropping the columns forgets every deadline; nothing else reads them.
  override down(): void | Promise<void> {
    this.addSql(`alter table "activities_occurrences" drop column if exists "confirm_by_minutes_before";`)
    this.addSql(`alter table "activities_activities" drop column if exists "confirm_by_minutes_before";`)
  }
}
