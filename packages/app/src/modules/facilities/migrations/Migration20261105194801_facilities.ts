import { Migration } from '@mikro-orm/migrations'

// Issue #121 (facilities spec phase 5 step 2; the module and its migrations approved by the product owner on 2026-11-05
// on #121): the zone rules, closures and rental rates of the new `facilities` module. Generated with `yarn db:generate`
// from an empty seed snapshot; new tables only, so no lock on existing tables.
export class Migration20261105194801_facilities extends Migration {
  override name = 'Migration20261105194801'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "facilities_closures" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "reason" text not null, "note" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_closures_tenant_org_idx" on "facilities_closures" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_closures_org_place_start_idx" on "facilities_closures" ("organization_id", "place_id", "starts_at");`,
    )

    this.addSql(
      `create table "facilities_rental_rates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "renter_category" text not null, "price_per_90" int not null, "season_from" text null, "season_to" text null, "includes_lighting" boolean not null default false, "valid_from" date not null, "valid_to" date null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_rental_rates_tenant_org_idx" on "facilities_rental_rates" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_rental_rates_org_place_category_idx" on "facilities_rental_rates" ("organization_id", "place_id", "renter_category");`,
    )

    this.addSql(
      `create table "facilities_zone_rules" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "weekdays" smallint[] not null, "time_from" time(0) not null, "time_to" time(0) not null, "zone" text not null, "priority" smallint not null, "source" text not null default 'regulations', "valid_from" date not null, "valid_to" date null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_zone_rules_tenant_org_idx" on "facilities_zone_rules" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_zone_rules_org_place_idx" on "facilities_zone_rules" ("organization_id", "place_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "facilities_zone_rules" cascade;`)
    this.addSql(`drop table if exists "facilities_rental_rates" cascade;`)
    this.addSql(`drop table if exists "facilities_closures" cascade;`)
  }
}
