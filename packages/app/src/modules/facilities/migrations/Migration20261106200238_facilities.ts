import { Migration } from '@mikro-orm/migrations'

// Issue #122 (facilities spec phase 5 step 3; the `facilities_*` migrations of phase 5 approved by the product owner on
// 2026-11-05 on #119/#121): the external rentals and the entry bans their check reads. Generated with `yarn db:generate`
// against an unreachable database; new tables only, so no lock on existing tables.
export class Migration20261106200238_facilities extends Migration {
  override name = 'Migration20261106200238'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "facilities_entry_bans" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "subject_type" text not null, "subject_id" uuid not null, "starts_on" date not null, "ends_on" date null, "reason" text not null, "incident_id" uuid null, "issued_by_person_id" uuid null, "revoked_at" timestamptz null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_entry_bans_tenant_org_idx" on "facilities_entry_bans" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_entry_bans_org_subject_idx" on "facilities_entry_bans" ("organization_id", "subject_type", "subject_id");`,
    )

    this.addSql(
      `create table "facilities_rentals" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "renter_type" text not null, "renter_id" uuid null, "renter_display_name" text not null, "renter_category" text not null, "contact_name" text null, "contact_phone" text null, "contact_email" text null, "purpose" text null, "requested_via" text not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "units" smallint not null, "rate_id" uuid null, "amount" int not null, "charge_id" uuid null, "status" text not null, "verification_token_hash" text null, "verification_expires_at" timestamptz null, "email_verified_at" timestamptz null, "hold_expires_at" timestamptz null, "decided_by_person_id" uuid null, "decided_at" timestamptz null, "decision_reason" text null, "entry_ban_match" boolean not null default false, "cancellation_deadline" timestamptz null, "payment_deadline" timestamptz null, "regulations_accepted_at" timestamptz null, "regulations_accepted_via" text null, "needs_reschedule" boolean not null default false, "notes" text null, primary key ("id"));`,
    )
    this.addSql(
      `alter table "facilities_rentals" add constraint "facilities_rentals_verification_token_hash_unique" unique ("verification_token_hash");`,
    )
    this.addSql(
      `create index "facilities_rentals_tenant_org_idx" on "facilities_rentals" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_rentals_org_status_hold_idx" on "facilities_rentals" ("organization_id", "status", "hold_expires_at");`,
    )
    this.addSql(
      `create index "facilities_rentals_org_place_start_idx" on "facilities_rentals" ("organization_id", "place_id", "starts_at");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "facilities_rentals" cascade;`)
    this.addSql(`drop table if exists "facilities_entry_bans" cascade;`)
  }
}
