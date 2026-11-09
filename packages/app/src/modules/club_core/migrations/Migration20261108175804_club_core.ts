import { Migration } from '@mikro-orm/migrations'

// Issue #124 (facilities spec phase 5 step 5; the owner approved this `club_core` migration on 2026-11-08, recorded on
// #124): the public calendar fields of a place (club spec *Place*, DD-23, DD-29) — its public slug, unique among the
// club's live places, and the switches "public schedule" and "accepts online requests". The new booleans default to
// false and the slug is nullable, so existing rows need no backfill. Generated with `yarn db:generate` (offline).

export class Migration20261108175804_club_core extends Migration {
  override name = 'Migration20261108175804'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "club_core_places" add "public_slug" text null, add "is_public_schedule" boolean not null default false, add "accepts_online_requests" boolean not null default false;`,
    )
    this.addSql(
      `create unique index "club_core_places_org_public_slug_unique" on "club_core_places" ("organization_id", "public_slug") where deleted_at is null and public_slug is not null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "club_core_places_org_public_slug_unique";`)
    this.addSql(
      `alter table "club_core_places" drop column "public_slug", drop column "is_public_schedule", drop column "accepts_online_requests";`,
    )
  }
}
