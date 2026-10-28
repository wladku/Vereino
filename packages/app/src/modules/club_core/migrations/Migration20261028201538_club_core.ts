import { Migration } from '@mikro-orm/migrations'

// Issue #25 (club spec phase 1 step 2): sections, places, institutions and the DD-37 club settings. Generated with
// `yarn db:generate`; `lock_timeout` added for the DDL on the existing settings table (S5.4) and `down()` written by
// hand.
export class Migration20261028201538_club_core extends Migration {
  override name = 'Migration20261028201538'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)

    this.addSql(
      `create table "club_core_institutions" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "type" text not null, "address" text null, "contact_name" text null, "contact_phone" text null, "contact_email" text null, "bank_account" text null, "notes" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "club_core_institutions_tenant_org_idx" on "club_core_institutions" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "club_core_institutions_org_type_idx" on "club_core_institutions" ("organization_id", "type");`,
    )

    this.addSql(
      `create table "club_core_places" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "parent_place_id" uuid null, "kind" text not null, "name" text not null, "surface" text null, "address" text null, "geo_lat" numeric(9,6) null, "geo_lng" numeric(9,6) null, "description" text null, "owner_institution_id" uuid null, "managed_by_club" boolean not null default false, "is_external" boolean not null default false, "rented_by_club" boolean not null default false, "capacity_groups" int not null default 1, "contacts" text null, "is_active" boolean not null default true, primary key ("id"));`,
    )
    this.addSql(
      `create index "club_core_places_tenant_org_idx" on "club_core_places" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "club_core_places_org_parent_idx" on "club_core_places" ("organization_id", "parent_place_id");`,
    )

    this.addSql(
      `create table "club_core_sections" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "description" text null, "is_active" boolean not null default true, primary key ("id"));`,
    )
    this.addSql(
      `create index "club_core_sections_tenant_org_idx" on "club_core_sections" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "club_core_sections_org_active_idx" on "club_core_sections" ("organization_id", "is_active");`,
    )

    this.addSql(
      `alter table "club_core_club_settings" add "short_name" text null, add "currency" text not null default 'PLN', add "declaration_kinds" jsonb not null default '{"training":"absence_only","match":"confirm","sparring":"confirm","tournament":"confirm","camp":"confirm","other":"confirm"}', add "online_fee_mode" text not null default 'club_pays', add "online_fee_percent" numeric(5,2) not null default 0, add "online_fee_fixed" int not null default 0, add "coach_settlement_model" text not null default 'units_per_contract', add "show_called_up_children" text not null default 'none', add "order_sales_document" text not null default 'none';`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "club_core_club_settings" drop column if exists "short_name", drop column if exists "currency", drop column if exists "declaration_kinds", drop column if exists "online_fee_mode", drop column if exists "online_fee_percent", drop column if exists "online_fee_fixed", drop column if exists "coach_settlement_model", drop column if exists "show_called_up_children", drop column if exists "order_sales_document";`,
    )
    this.addSql(`drop table if exists "club_core_sections" cascade;`)
    this.addSql(`drop table if exists "club_core_places" cascade;`)
    this.addSql(`drop table if exists "club_core_institutions" cascade;`)
  }
}
