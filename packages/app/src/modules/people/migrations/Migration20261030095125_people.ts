import { Migration } from '@mikro-orm/migrations'

// Issue #28 (club spec phase 1 step 8, REQ-036, DD-38): the bulk import of people and families — `people_imports`
// (the file's attachment, the mapping, status, who uploaded and committed it, the summary, `purged_at`) and
// `people_import_rows` (one staged row: encrypted `raw`, classification, decision, problem column, the group kept
// for the `groups` hook) — and the import identifier on the person (`external_id`, encrypted, with the
// `external_id_hash` lookup hash and its partial unique index per organization). Generated with `yarn db:generate`
// against a throwaway database; `lock_timeout` added for the DDL on the existing `people_persons` (S5.4), the new
// columns are nullable, and `down()` is written by hand.
export class Migration20261030095125_people extends Migration {
  override name = 'Migration20261030095125'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "people_imports" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "file_attachment_id" uuid null, "file_format" text not null, "mapping" jsonb not null, "status" text not null, "row_count" int not null, "created_by_person_id" uuid not null, "committed_at" timestamptz null, "committed_by_person_id" uuid null, "cancelled_at" timestamptz null, "purged_at" timestamptz null, "summary" jsonb not null default '{}', primary key ("id"));`,
    )
    this.addSql(
      `create index "people_imports_org_status_purged_idx" on "people_imports" ("organization_id", "status", "purged_at");`,
    )
    this.addSql(`create index "people_imports_tenant_org_idx" on "people_imports" ("tenant_id", "organization_id");`)
    this.addSql(`create index "people_imports_org_created_idx" on "people_imports" ("organization_id", "created_at");`)

    this.addSql(
      `create table "people_import_rows" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "import_id" uuid not null, "row_no" int not null, "raw" text null, "classification" text not null, "matched_person_id" uuid null, "decision" text null, "decision_person_id" uuid null, "error_code" text null, "error_column" text null, "review_reason" text null, "group_name" text null, "membership_status" text null, "committed_at" timestamptz null, "result" jsonb null, primary key ("id"));`,
    )
    this.addSql(
      `create index "people_import_rows_org_import_class_idx" on "people_import_rows" ("organization_id", "import_id", "classification");`,
    )
    this.addSql(
      `create index "people_import_rows_tenant_org_idx" on "people_import_rows" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `alter table "people_import_rows" add constraint "people_import_rows_org_import_row_unique" unique ("organization_id", "import_id", "row_no");`,
    )

    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "people_persons" add "external_id" text null, add "external_id_hash" text null;`)
    this.addSql(
      `create unique index "people_persons_org_external_id_hash_unique" on "people_persons" ("organization_id", "external_id_hash") where deleted_at is null and external_id_hash is not null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`drop index if exists "people_persons_org_external_id_hash_unique";`)
    this.addSql(
      `alter table "people_persons" drop column if exists "external_id", drop column if exists "external_id_hash";`,
    )
    this.addSql(`drop table if exists "people_import_rows";`)
    this.addSql(`drop table if exists "people_imports";`)
  }
}
