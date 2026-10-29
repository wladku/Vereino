import { Migration } from '@mikro-orm/migrations'

// Issue #30 (club spec phase 2 step 2): the new `groups` tables — seasons, groups of both kinds, memberships with
// their history and external teams. Generated with `yarn db:generate` (offline, from an empty seed snapshot, because no
// throwaway Postgres was available); it creates only new tables, so no `lock_timeout` is needed, and `down()` is
// written by hand.
export class Migration20261029121233_groups extends Migration {
  override name = 'Migration20261029121233'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "groups_external_teams" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "club_name" text null, "institution_id" uuid null, "contact" text null, "notes" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "groups_external_teams_tenant_org_idx" on "groups_external_teams" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "groups_external_teams_org_name_idx" on "groups_external_teams" ("organization_id", "name");`,
    )

    this.addSql(
      `create table "groups_groups" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "section_id" uuid not null, "name" text not null, "kind" text not null, "league" text null, "season_id" uuid null, "description" text null, "is_active" boolean not null default true, primary key ("id"));`,
    )
    this.addSql(`create index "groups_groups_tenant_org_idx" on "groups_groups" ("tenant_id", "organization_id");`)
    this.addSql(`create index "groups_groups_org_season_idx" on "groups_groups" ("organization_id", "season_id");`)
    this.addSql(
      `create index "groups_groups_org_section_active_idx" on "groups_groups" ("organization_id", "section_id", "is_active");`,
    )

    this.addSql(
      `create table "groups_memberships" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "group_id" uuid not null, "person_id" uuid not null, "role" text not null, "valid_from" date not null, "valid_to" date null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "groups_memberships_org_open_unique" on "groups_memberships" ("organization_id", "group_id", "person_id", "role") where deleted_at is null and valid_to is null;`,
    )
    this.addSql(
      `create index "groups_memberships_tenant_org_idx" on "groups_memberships" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "groups_memberships_org_person_idx" on "groups_memberships" ("organization_id", "person_id");`,
    )
    this.addSql(
      `create index "groups_memberships_org_group_valid_to_idx" on "groups_memberships" ("organization_id", "group_id", "valid_to");`,
    )

    this.addSql(
      `create table "groups_seasons" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "starts_on" date not null, "ends_on" date not null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "groups_seasons_org_name_unique" on "groups_seasons" ("organization_id", "name") where deleted_at is null;`,
    )
    this.addSql(`create index "groups_seasons_tenant_org_idx" on "groups_seasons" ("tenant_id", "organization_id");`)
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "groups_seasons" cascade;`)
    this.addSql(`drop table if exists "groups_memberships" cascade;`)
    this.addSql(`drop table if exists "groups_groups" cascade;`)
    this.addSql(`drop table if exists "groups_external_teams" cascade;`)
  }
}
