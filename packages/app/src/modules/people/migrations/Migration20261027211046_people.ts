import { Migration } from '@mikro-orm/migrations'

export class Migration20261027211046_people extends Migration {
  override name = 'Migration20261027211046'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "people_guardianships" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "guardian_person_id" uuid not null, "ward_person_id" uuid not null, "valid_from" date not null, "valid_to" date null, primary key ("id"));`,
    )
    this.addSql(
      `create index "people_guardianships_tenant_org_idx" on "people_guardianships" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "people_guardianships_org_guardian_idx" on "people_guardianships" ("organization_id", "guardian_person_id");`,
    )
    this.addSql(
      `create index "people_guardianships_org_ward_idx" on "people_guardianships" ("organization_id", "ward_person_id");`,
    )

    this.addSql(
      `create table "people_persons" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "first_name" text not null, "last_name" text not null, "preferred_locale" text null, "birth_date" date null, "email" text null, "pesel" text null, "pesel_hash" text null, "user_id" uuid null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "people_persons_org_user_unique" on "people_persons" ("organization_id", "user_id") where deleted_at is null and user_id is not null;`,
    )
    this.addSql(
      `create unique index "people_persons_org_pesel_hash_unique" on "people_persons" ("organization_id", "pesel_hash") where deleted_at is null and pesel_hash is not null;`,
    )
    this.addSql(`create index "people_persons_tenant_org_idx" on "people_persons" ("tenant_id", "organization_id");`)
    this.addSql(`create index "people_persons_org_last_name_idx" on "people_persons" ("organization_id", "last_name");`)

    this.addSql(
      `create table "people_role_assignments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "person_id" uuid not null, "role" text not null, "section_id" uuid null, "valid_from" date not null, "valid_to" date null, primary key ("id"));`,
    )
    this.addSql(
      `create index "people_role_assignments_tenant_org_idx" on "people_role_assignments" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "people_role_assignments_org_section_idx" on "people_role_assignments" ("organization_id", "section_id");`,
    )
    this.addSql(
      `create index "people_role_assignments_org_person_role_idx" on "people_role_assignments" ("organization_id", "person_id", "role");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "people_role_assignments" cascade;`)
    this.addSql(`drop table if exists "people_persons" cascade;`)
    this.addSql(`drop table if exists "people_guardianships" cascade;`)
  }
}
