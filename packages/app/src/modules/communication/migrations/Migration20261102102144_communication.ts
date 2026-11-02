import { Migration } from '@mikro-orm/migrations'

export class Migration20261102102144_communication extends Migration {
  override name = 'Migration20261102102144'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "communication_threads" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "scope_type" text not null, "scope_id" uuid null, "section_id" uuid null, "group_id" uuid null, "subject" text not null, "author_person_id" uuid null, "is_case" boolean not null default false, "case_opened_at" timestamptz null, "case_opened_by_person_id" uuid null, "last_message_at" timestamptz not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "communication_threads_tenant_org_idx" on "communication_threads" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "communication_threads_org_last_message_idx" on "communication_threads" ("organization_id", "last_message_at");`,
    )
    this.addSql(
      `create index "communication_threads_org_section_case_idx" on "communication_threads" ("organization_id", "section_id", "is_case");`,
    )
    this.addSql(
      `create unique index "communication_threads_occurrence_unique" on "communication_threads" ("organization_id", "scope_id") where scope_type = 'occurrence' and deleted_at is null;`,
    )
    this.addSql(
      `create index "communication_threads_org_scope_idx" on "communication_threads" ("organization_id", "scope_type", "scope_id");`,
    )

    this.addSql(
      `create table "communication_thread_messages" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "thread_id" uuid not null, "kind" text not null, "supersedes_message_id" uuid null, "author_person_id" uuid null, "acting_role" text not null, "audience" text not null, "body" text null, "dispatch_id" uuid null, "recipient_count" int not null default 0, primary key ("id"));`,
    )
    this.addSql(
      `create index "communication_thread_messages_tenant_org_idx" on "communication_thread_messages" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "communication_thread_messages_supersedes_idx" on "communication_thread_messages" ("supersedes_message_id");`,
    )
    this.addSql(
      `create index "communication_thread_messages_org_thread_idx" on "communication_thread_messages" ("organization_id", "thread_id", "created_at");`,
    )

    this.addSql(
      `create table "communication_thread_participants" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "thread_id" uuid not null, "person_id" uuid not null, "reasons" text[] not null default '{}', primary key ("id"));`,
    )
    this.addSql(
      `create index "communication_thread_participants_tenant_org_idx" on "communication_thread_participants" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "communication_thread_participants_org_person_idx" on "communication_thread_participants" ("organization_id", "person_id");`,
    )
    this.addSql(
      `alter table "communication_thread_participants" add constraint "communication_thread_participants_thread_person_unique" unique ("thread_id", "person_id");`,
    )

    this.addSql(
      `create table "communication_thread_reads" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "thread_id" uuid not null, "person_id" uuid not null, "last_read_at" timestamptz not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "communication_thread_reads_tenant_org_idx" on "communication_thread_reads" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `alter table "communication_thread_reads" add constraint "communication_thread_reads_thread_person_unique" unique ("thread_id", "person_id");`,
    )
  }

  // Written by hand: the four tables are new and owned by `communication` alone, so the rollback drops them.
  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "communication_thread_reads" cascade;`)
    this.addSql(`drop table if exists "communication_thread_participants" cascade;`)
    this.addSql(`drop table if exists "communication_thread_messages" cascade;`)
    this.addSql(`drop table if exists "communication_threads" cascade;`)
  }
}
