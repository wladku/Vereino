import { Migration } from '@mikro-orm/migrations'

export class Migration20261102074140_foundation extends Migration {
  override name = 'Migration20261102074140'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "foundation_deliveries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "dispatch_id" uuid not null, "person_id" uuid null, "user_id" uuid null, "channel" text not null, "email" text null, "email_hash" text null, "locale" text not null, "reasons" text[] not null default '{}', "status" text not null default 'queued', "skip_reason" text null, "attempts" int not null default 0, "next_attempt_at" timestamptz not null default now(), "lease_owner" text null, "lease_expires_at" timestamptz null, "sent_at" timestamptz null, "failed_at" timestamptz null, "failure_code" text null, "secret_params" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "foundation_deliveries_tenant_org_idx" on "foundation_deliveries" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "foundation_deliveries_status_next_attempt_idx" on "foundation_deliveries" ("status", "next_attempt_at");`,
    )
    this.addSql(
      `create index "foundation_deliveries_org_dispatch_status_idx" on "foundation_deliveries" ("organization_id", "dispatch_id", "status");`,
    )
    this.addSql(
      `create unique index "foundation_deliveries_dispatch_person_channel_unique" on "foundation_deliveries" ("dispatch_id", "person_id", "channel") where person_id is not null;`,
    )

    this.addSql(
      `create table "foundation_dispatches" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "template_id" text not null, "source_module" text not null, "source_type" text not null, "source_id" uuid not null, "idempotency_key" text not null, "audience" jsonb null, "params" text not null, "actor_user_id" uuid null, "acting_role" text not null, "status" text not null default 'queued', "published_at" timestamptz null, "recipient_count" int not null default 0, "sent_count" int not null default 0, "failed_count" int not null default 0, "skipped_count" int not null default 0, primary key ("id"));`,
    )
    this.addSql(
      `create index "foundation_dispatches_tenant_org_idx" on "foundation_dispatches" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "foundation_dispatches_org_source_idx" on "foundation_dispatches" ("organization_id", "source_type", "source_id");`,
    )
    this.addSql(
      `create unique index "foundation_dispatches_org_key_unique" on "foundation_dispatches" ("organization_id", "idempotency_key");`,
    )
  }

  // Hand-written (foundation III phase A, #71): the two tables are new and nothing else references them.
  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "foundation_deliveries" cascade;`)
    this.addSql(`drop table if exists "foundation_dispatches" cascade;`)
  }
}
