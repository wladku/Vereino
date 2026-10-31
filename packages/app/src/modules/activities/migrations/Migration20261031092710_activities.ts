import { Migration } from '@mikro-orm/migrations'

export class Migration20261031092710_activities extends Migration {
  override name = 'Migration20261031092710'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "activities_contact_access_log" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "actor_user_id" uuid not null, "acting_role" text not null, "occurrence_id" uuid not null, "resource_kind" text not null, "resource_ids" uuid[] not null, "purpose" text not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "activities_contact_access_log_tenant_org_idx" on "activities_contact_access_log" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "activities_contact_access_log_org_occurrence_created_idx" on "activities_contact_access_log" ("organization_id", "occurrence_id", "created_at");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "activities_contact_access_log" cascade;`)
  }
}
