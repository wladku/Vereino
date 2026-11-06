import { Migration } from '@mikro-orm/migrations'

export class Migration20261105110214_activities extends Migration {
  override name = 'Migration20261105110214'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "activities_declaration_tokens" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "token_hash" text not null, "expires_at" timestamptz not null, "used_count" int not null default 0, "last_used_at" timestamptz null, "guardian_person_id" uuid not null, "occurrence_id" uuid not null, primary key ("id"));`,
    )
    this.addSql(
      `alter table "activities_declaration_tokens" add constraint "activities_declaration_tokens_token_hash_unique" unique ("token_hash");`,
    )
    this.addSql(
      `create index "activities_declaration_tokens_tenant_org_idx" on "activities_declaration_tokens" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "activities_declaration_tokens_org_occurrence_idx" on "activities_declaration_tokens" ("organization_id", "occurrence_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "activities_declaration_tokens" cascade;`)
  }
}
