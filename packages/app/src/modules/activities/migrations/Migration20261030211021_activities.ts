import { Migration } from '@mikro-orm/migrations'

// Issue #32 (club spec phase 2 steps 4 and 5, REQ-007): the attendance declarations — one row per session and
// participant with the declared value, who declared it, the declaration status and the expiry columns the job needs
// (`pending_until`, `timeout_outcome`), plus the actual-attendance columns #33 fills — and the declaration policies with
// the partial unique index over their coalesced scope keys. Generated with `yarn db:generate` against a throwaway
// Postgres; it creates only new tables, so no `lock_timeout` is needed, and `down()` is written by hand.
export class Migration20261030211021_activities extends Migration {
  override name = 'Migration20261030211021'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "activities_attendances" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "occurrence_id" uuid not null, "person_id" uuid not null, "declared" text not null default 'unknown', "declared_by_person_id" uuid null, "declared_at" timestamptz null, "declaration_status" text not null default 'final', "guardian_decided_at" timestamptz null, "pending_until" timestamptz null, "timeout_outcome" text null, "actual" text null, "marked_by_person_id" uuid null, "marked_as_role" text null, "source" text not null default 'app', primary key ("id"));`,
    )
    this.addSql(
      `create index "activities_attendances_tenant_org_idx" on "activities_attendances" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "activities_attendances_org_status_pending_idx" on "activities_attendances" ("organization_id", "declaration_status", "pending_until");`,
    )
    this.addSql(
      `create index "activities_attendances_org_person_idx" on "activities_attendances" ("organization_id", "person_id");`,
    )
    this.addSql(
      `create index "activities_attendances_org_occurrence_idx" on "activities_attendances" ("organization_id", "occurrence_id");`,
    )
    this.addSql(
      `create unique index "activities_attendances_occurrence_person_unique" on "activities_attendances" ("occurrence_id", "person_id") where deleted_at is null;`,
    )

    this.addSql(
      `create table "activities_attendance_policies" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "scope" text not null, "group_id" uuid null, "activity_type" text null, "minor_declaration_mode" text not null, "confirm_timeout_hours" int not null default 24, "default_after_timeout" text not null default 'declared', primary key ("id"));`,
    )
    this.addSql(
      `create index "activities_attendance_policies_tenant_org_idx" on "activities_attendance_policies" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create unique index "activities_attendance_policies_scope_unique" on "activities_attendance_policies" ("organization_id", "scope", coalesce("group_id"::text, ''), coalesce("activity_type", '')) where deleted_at is null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "activities_attendance_policies" cascade;`)
    this.addSql(`drop table if exists "activities_attendances" cascade;`)
  }
}
