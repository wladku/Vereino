import { Migration } from '@mikro-orm/migrations'

// Issue #126 (facilities spec phase 5 step 7; the `facilities_*` migrations of phase 5 approved by the product owner on
// 2026-11-05 on #119): the facility log and the incidents. Generated with `yarn db:generate` against an unreachable
// database; two new tables only, so no lock on existing tables.
export class Migration20261108173422_facilities extends Migration {
  override name = 'Migration20261108173422'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "facilities_logs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "log_date" date not null, "operator_person_id" uuid not null, "opened_at" timestamptz null, "closed_at" timestamptz null, "condition_before" text null, "condition_after" text null, "groups_present" jsonb not null default '[]', "remarks" text null, primary key ("id"));`,
    )
    this.addSql(`create index "facilities_logs_tenant_org_idx" on "facilities_logs" ("tenant_id", "organization_id");`)
    this.addSql(
      `alter table "facilities_logs" add constraint "facilities_logs_org_place_date_unique" unique ("organization_id", "place_id", "log_date");`,
    )
    this.addSql(
      `create table "facilities_incidents" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "occurred_at" timestamptz not null, "reported_by_person_id" uuid not null, "kind" text not null, "description" text not null, "involved" text null, "action_taken" text[] not null default '{}', "thread_id" uuid null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_incidents_tenant_org_idx" on "facilities_incidents" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_incidents_org_place_time_idx" on "facilities_incidents" ("organization_id", "place_id", "occurred_at");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "facilities_incidents" cascade;`)
    this.addSql(`drop table if exists "facilities_logs" cascade;`)
  }
}
