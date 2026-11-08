import { Migration } from '@mikro-orm/migrations'

// Issue #123 (facilities spec phase 5 step 4; the `facilities_*` migrations of phase 5 approved by the product owner on
// 2026-11-05 on #119/#121): the internal bookings staff make at once. Generated with `yarn db:generate` against an
// unreachable database; a new table only, so no lock on existing tables.
export class Migration20261108152351_facilities extends Migration {
  override name = 'Migration20261108152351'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "facilities_internal_bookings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "section_id" uuid not null, "purpose" text not null, "booked_by_person_id" uuid not null, "acting_role" text not null, "status" text not null default 'confirmed', "needs_reschedule" boolean not null default false, "cancelled_by_person_id" uuid null, "cancel_reason" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_internal_bookings_tenant_org_idx" on "facilities_internal_bookings" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_internal_bookings_org_booker_idx" on "facilities_internal_bookings" ("organization_id", "booked_by_person_id");`,
    )
    this.addSql(
      `create index "facilities_internal_bookings_org_place_start_idx" on "facilities_internal_bookings" ("organization_id", "place_id", "starts_at");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "facilities_internal_bookings" cascade;`)
  }
}
