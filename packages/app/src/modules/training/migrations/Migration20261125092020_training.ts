import { Migration } from '@mikro-orm/migrations'

// Issue #685 (training outlines spec phase 4, E24-S05, DD-O10…DD-O14; the tables approved by the product owner on
// 2026-11-24 on #671): the shared outline library — `training_library_entries` (published snapshots), `_ratings`,
// `_uses` and `_reports` (pseudonymous rater keys). Their rows live only in the configured library tenant. Generated
// with `yarn db:generate` against an unreachable database (never applied to a dev or real one); new tables only, so no
// lock on existing tables. `down()` is hand-written.
export class Migration20261125092020_training extends Migration {
  override name = 'Migration20261125092020'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "training_library_entries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "source_organization_id" uuid not null, "source_outline_id" uuid not null, "visibility" text not null, "status" text not null default 'listed', "language" text not null, "topic" text not null, "goal" text not null, "specific_goals" text not null, "age_category" text not null, "duration_minutes" int not null, "players_count" int null, "equipment" text not null, "parts" jsonb not null, "images" jsonb not null, "credit" jsonb not null, "licence" text not null, "rating_sum" int not null default 0, "rating_count" int not null default 0, "user_count" int not null default 0, "report_count" int not null default 0, "published_at" timestamptz not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "training_library_entries_source_org_idx" on "training_library_entries" ("tenant_id", "source_organization_id");`,
    )
    this.addSql(
      `create index "training_library_entries_listing_idx" on "training_library_entries" ("tenant_id", "status", "visibility", "age_category");`,
    )
    this.addSql(
      `create unique index "training_library_entries_source_unique" on "training_library_entries" ("tenant_id", "source_organization_id", "source_outline_id") where deleted_at is null;`,
    )
    this.addSql(
      `create table "training_library_ratings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "entry_id" uuid not null, "rater_key" text not null, "rater_key_version" int not null, "rater_organization_id" uuid not null, "stars" int not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "training_library_ratings_rater_key_idx" on "training_library_ratings" ("tenant_id", "rater_key");`,
    )
    this.addSql(
      `create index "training_library_ratings_rater_org_idx" on "training_library_ratings" ("tenant_id", "rater_organization_id");`,
    )
    this.addSql(
      `create unique index "training_library_ratings_entry_rater_unique" on "training_library_ratings" ("entry_id", "rater_key");`,
    )
    this.addSql(
      `create table "training_library_reports" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "entry_id" uuid not null, "rater_key" text not null, "rater_key_version" int not null, "rater_organization_id" uuid null, "reason" text not null, "note" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "training_library_reports_rater_key_idx" on "training_library_reports" ("tenant_id", "rater_key");`,
    )
    this.addSql(
      `create index "training_library_reports_rater_org_idx" on "training_library_reports" ("tenant_id", "rater_organization_id");`,
    )
    this.addSql(
      `create unique index "training_library_reports_entry_rater_unique" on "training_library_reports" ("entry_id", "rater_key");`,
    )
    this.addSql(
      `create table "training_library_uses" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "entry_id" uuid not null, "rater_key" text not null, "rater_key_version" int not null, "rater_organization_id" uuid not null, "occurrence_count" int not null default 1, primary key ("id"));`,
    )
    this.addSql(
      `create index "training_library_uses_rater_key_idx" on "training_library_uses" ("tenant_id", "rater_key");`,
    )
    this.addSql(
      `create index "training_library_uses_rater_org_idx" on "training_library_uses" ("tenant_id", "rater_organization_id");`,
    )
    this.addSql(
      `create unique index "training_library_uses_entry_rater_unique" on "training_library_uses" ("entry_id", "rater_key");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "training_library_uses" cascade;`)
    this.addSql(`drop table if exists "training_library_reports" cascade;`)
    this.addSql(`drop table if exists "training_library_ratings" cascade;`)
    this.addSql(`drop table if exists "training_library_entries" cascade;`)
  }
}
