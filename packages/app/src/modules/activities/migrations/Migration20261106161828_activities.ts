import { Migration } from '@mikro-orm/migrations'

export class Migration20261106161828_activities extends Migration {
  override name = 'Migration20261106161828'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "activities_substitution_entries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "occurrence_id" uuid not null, "previous_coach_person_id" uuid null, "new_coach_person_id" uuid null, "kind" text not null, "reason" text null, "decided_by_person_id" uuid not null, "acting_role" text not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "activities_substitution_entries_tenant_org_idx" on "activities_substitution_entries" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "activities_substitution_entries_org_occurrence_idx" on "activities_substitution_entries" ("organization_id", "occurrence_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "activities_substitution_entries" cascade;`)
  }
}
