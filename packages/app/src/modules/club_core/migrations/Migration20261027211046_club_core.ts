import { Migration } from '@mikro-orm/migrations'

export class Migration20261027211046_club_core extends Migration {
  override name = 'Migration20261027211046'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "club_core_club_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "own_account_min_age" int not null default 16, "default_locale" text not null default 'pl', "timezone" text not null default 'Europe/Warsaw', primary key ("id"));`,
    )
    this.addSql(
      `create index "club_core_club_settings_tenant_org_idx" on "club_core_club_settings" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `alter table "club_core_club_settings" add constraint "club_core_club_settings_organization_unique" unique ("organization_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "club_core_club_settings" cascade;`)
  }
}
