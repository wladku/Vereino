import { Migration } from '@mikro-orm/migrations'

// Migration B of the groups and activities parity spec (REQ-A08, DD-A03, #270; approved on #252 on 2026-11-16): a
// typed venue (`venue_name`, `venue_address`) on the activity and the session, `default_place_id` and `place_id`
// nullable, and two named checks per table — exactly one of a club place and a typed venue, and no address without a
// name. Existing rows all have a place and no venue, so every check holds without a backfill. Additive until the first
// typed venue is saved; after that the previous release cannot render that session (rollback rule below).
export class Migration20261117110933_activities extends Migration {
  override name = 'Migration20261117110933'

  override up(): void | Promise<void> {
    this.addSql(`alter table "activities_activities" add "venue_name" text null, add "venue_address" text null;`)
    this.addSql(`alter table "activities_activities" alter column "default_place_id" drop not null;`)
    this.addSql(
      `alter table "activities_activities" add constraint "activities_activities_venue_address_with_name" check (venue_address IS NULL OR venue_name IS NOT NULL);`,
    )
    this.addSql(
      `alter table "activities_activities" add constraint "activities_activities_place_or_venue" check ((default_place_id IS NOT NULL) <> (venue_name IS NOT NULL));`,
    )

    this.addSql(`alter table "activities_occurrences" add "venue_name" text null, add "venue_address" text null;`)
    this.addSql(`alter table "activities_occurrences" alter column "place_id" drop not null;`)
    this.addSql(
      `alter table "activities_occurrences" add constraint "activities_occurrences_venue_address_with_name" check (venue_address IS NULL OR venue_name IS NOT NULL);`,
    )
    this.addSql(
      `alter table "activities_occurrences" add constraint "activities_occurrences_place_or_venue" check ((place_id IS NOT NULL) <> (venue_name IS NOT NULL));`,
    )
  }

  // Rollback rule (spec *Rollout*): before this runs, list the typed-venue rows —
  //   select id, organization_id, start_at from activities_occurrences where place_id is null and deleted_at is null;
  //   select id, organization_id, starts_on from activities_activities where default_place_id is null and deleted_at is null;
  // — and cancel them or give each a club place. `set not null` fails while one is left, so nothing is lost silently.
  override down(): void | Promise<void> {
    this.addSql(
      `alter table "activities_occurrences" drop constraint if exists "activities_occurrences_venue_address_with_name";`,
    )
    this.addSql(
      `alter table "activities_occurrences" drop constraint if exists "activities_occurrences_place_or_venue";`,
    )
    this.addSql(`alter table "activities_occurrences" alter column "place_id" set not null;`)
    this.addSql(
      `alter table "activities_occurrences" drop column if exists "venue_name", drop column if exists "venue_address";`,
    )

    this.addSql(
      `alter table "activities_activities" drop constraint if exists "activities_activities_venue_address_with_name";`,
    )
    this.addSql(`alter table "activities_activities" drop constraint if exists "activities_activities_place_or_venue";`)
    this.addSql(`alter table "activities_activities" alter column "default_place_id" set not null;`)
    this.addSql(
      `alter table "activities_activities" drop column if exists "venue_name", drop column if exists "venue_address";`,
    )
  }
}
