import { Migration } from '@mikro-orm/migrations'

// Issue #128 (facilities spec phase 5 step 9; the `facilities_*` migrations of phase 5 approved by the product owner on
// 2026-11-05 on #119): the maintenance tasks and the place maintainers (REQ-022, DD-36). Generated with
// `yarn db:generate` against an unreachable database; two new tables, no change to existing rows.
export class Migration20261109202809_facilities extends Migration {
  override name = 'Migration20261109202809'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "facilities_maintenance_tasks" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "kind" text not null, "responsible" text not null, "schedule_type" text not null, "starts_at" timestamptz null, "ends_at" timestamptz null, "due_date" date null, "recurrence_rule" text null, "usage_hours_threshold" int null, "usage_counted_from" timestamptz null, "series_id" uuid null, "status" text not null default 'planned', "planned_by_person_id" uuid not null, "done_at" timestamptz null, "done_by_person_id" uuid null, "cost" int null, "notes" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_maintenance_tasks_tenant_org_idx" on "facilities_maintenance_tasks" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_maintenance_tasks_org_status_type_idx" on "facilities_maintenance_tasks" ("organization_id", "status", "schedule_type");`,
    )
    this.addSql(
      `create index "facilities_maintenance_tasks_org_place_due_idx" on "facilities_maintenance_tasks" ("organization_id", "place_id", "due_date");`,
    )
    this.addSql(
      `create index "facilities_maintenance_tasks_org_place_start_idx" on "facilities_maintenance_tasks" ("organization_id", "place_id", "starts_at");`,
    )

    this.addSql(
      `create table "facilities_place_maintainers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "person_id" uuid not null, "assigned_by_person_id" uuid null, "assigned_at" timestamptz not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_place_maintainers_tenant_org_idx" on "facilities_place_maintainers" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_place_maintainers_org_person_idx" on "facilities_place_maintainers" ("organization_id", "person_id");`,
    )
    this.addSql(
      `alter table "facilities_place_maintainers" add constraint "facilities_place_maintainers_org_place_person_unique" unique ("organization_id", "place_id", "person_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "facilities_place_maintainers" cascade;`)
    this.addSql(`drop table if exists "facilities_maintenance_tasks" cascade;`)
  }
}
