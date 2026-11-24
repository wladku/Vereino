import { Migration } from '@mikro-orm/migrations'

export class Migration20261122094238_people extends Migration {
  override name = 'Migration20261122094238'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "people_data_export_log" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "actor_user_id" uuid not null, "acting_role" text not null, "resource_kind" text not null, "resource_ids" uuid[] not null, "purpose" text not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "people_data_export_log_tenant_org_created_idx" on "people_data_export_log" ("tenant_id", "organization_id", "created_at");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "people_data_export_log" cascade;`)
  }
}
