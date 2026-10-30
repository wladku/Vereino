import { Migration } from '@mikro-orm/migrations'

// Issue #31 (club spec phase 2 steps 3 and 8): the new `activities` tables — activities (weekly series and one-off
// events) and their sessions, with the partial unique slot index that makes a retried generator a no-op. Generated with
// `yarn db:generate` against a throwaway Postgres; it creates only new tables, so no `lock_timeout` is needed, and
// `down()` is written by hand.
export class Migration20261029203218_activities extends Migration {
  override name = 'Migration20261029203218'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "activities_activities" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "section_id" uuid not null, "group_id" uuid not null, "name" text not null, "type" text not null, "default_place_id" uuid not null, "default_coach_person_id" uuid null, "opponent_external_team_id" uuid null, "invited_external_team_ids" uuid[] not null default '{}', "recurrence_rule" text null, "starts_on" date not null, "ends_on" date null, "default_start_time" time(0) not null, "default_end_time" time(0) not null, "generated_until" date null, "description" text null, "is_active" boolean not null default true, primary key ("id"));`,
    )
    this.addSql(
      `create index "activities_activities_tenant_org_idx" on "activities_activities" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "activities_activities_org_section_idx" on "activities_activities" ("organization_id", "section_id");`,
    )
    this.addSql(
      `create index "activities_activities_org_group_active_idx" on "activities_activities" ("organization_id", "group_id", "is_active");`,
    )
    this.addSql(
      `create table "activities_occurrences" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "activity_id" uuid not null, "group_id" uuid not null, "section_id" uuid not null, "occurrence_date" date not null, "start_at" timestamptz not null, "end_at" timestamptz not null, "place_id" uuid not null, "coach_person_id" uuid null, "status" text not null default 'planned', "cancel_reason" text null, "is_detached" boolean not null default false, "needs_reschedule" boolean not null default false, primary key ("id"));`,
    )
    this.addSql(
      `create index "activities_occurrences_tenant_org_idx" on "activities_occurrences" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "activities_occurrences_org_activity_idx" on "activities_occurrences" ("organization_id", "activity_id");`,
    )
    this.addSql(
      `create index "activities_occurrences_org_group_start_idx" on "activities_occurrences" ("organization_id", "group_id", "start_at");`,
    )
    this.addSql(
      `create index "activities_occurrences_org_status_start_idx" on "activities_occurrences" ("organization_id", "status", "start_at");`,
    )
    this.addSql(
      `create index "activities_occurrences_org_coach_start_idx" on "activities_occurrences" ("organization_id", "coach_person_id", "start_at");`,
    )
    this.addSql(
      `create index "activities_occurrences_org_place_start_idx" on "activities_occurrences" ("organization_id", "place_id", "start_at");`,
    )
    this.addSql(
      `create unique index "activities_occurrences_slot_unique" on "activities_occurrences" ("activity_id", "occurrence_date") where deleted_at is null and is_detached = false;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "activities_occurrences" cascade;`)
    this.addSql(`drop table if exists "activities_activities" cascade;`)
  }
}
