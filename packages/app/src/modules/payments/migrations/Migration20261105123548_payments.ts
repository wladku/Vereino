import { Migration } from '@mikro-orm/migrations'

// Issue #108 (payments spec phase 4 step 2; phase 4 approved in D-030, the migration taken as approved on the owner's
// autonomous instruction of 2026-11-05): the new `payments` tables - fee schedules, discount rules, charges with the
// partial unique index that makes period generation idempotent, generation runs and the club's payment settings.
// Generated with `yarn db:generate` (offline, from an empty seed snapshot); it creates only new tables, so no
// `lock_timeout` is needed, and `down()` is written by hand.

export class Migration20261105123548_payments extends Migration {
  override name = 'Migration20261105123548'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "payments_charges" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "source_type" text not null, "source_id" uuid null, "person_id" uuid null, "payer_person_id" uuid null, "payer_missing" boolean not null default false, "period_label" text null, "description" text not null, "amount" int not null, "discount_amount" int not null default 0, "discount_rule_id" uuid null, "due_date" date not null, "payee" text not null default 'club', "status" text not null default 'open', "generation_id" uuid null, "cancelled_at" timestamptz null, "cancel_reason" text null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "payments_charges_org_fee_person_period_unique" on "payments_charges" ("organization_id", "source_id", "person_id", "period_label") where source_type = 'fee' and status <> 'cancelled' and deleted_at is null;`,
    )
    this.addSql(
      `create index "payments_charges_tenant_org_idx" on "payments_charges" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_charges_org_generation_idx" on "payments_charges" ("organization_id", "generation_id");`,
    )
    this.addSql(
      `create index "payments_charges_org_status_due_idx" on "payments_charges" ("organization_id", "status", "due_date");`,
    )
    this.addSql(
      `create index "payments_charges_org_payer_idx" on "payments_charges" ("organization_id", "payer_person_id");`,
    )
    this.addSql(
      `create index "payments_charges_org_person_idx" on "payments_charges" ("organization_id", "person_id");`,
    )
    this.addSql(
      `create index "payments_charges_org_period_idx" on "payments_charges" ("organization_id", "period_label");`,
    )

    this.addSql(
      `create table "payments_charge_generations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "period" text not null, "created_count" int not null, "skipped_count" int not null, "payer_missing_count" int not null, "undone_at" timestamptz null, "cancelled_count" int null, primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_charge_generations_tenant_org_idx" on "payments_charge_generations" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_charge_generations_org_period_idx" on "payments_charge_generations" ("organization_id", "period");`,
    )

    this.addSql(
      `create table "payments_discount_rules" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "kind" text not null, "percent" int null, "amount" int null, "conditions" jsonb not null, "valid_from" date not null, "valid_to" date null, primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_discount_rules_tenant_org_idx" on "payments_discount_rules" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_discount_rules_org_kind_idx" on "payments_discount_rules" ("organization_id", "kind");`,
    )

    this.addSql(
      `create table "payments_fees" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "amount" int not null, "period" text not null, "group_id" uuid null, "activity_id" uuid null, "due_day" int not null, "valid_from" date not null, "valid_to" date null, primary key ("id"));`,
    )
    this.addSql(`create index "payments_fees_tenant_org_idx" on "payments_fees" ("tenant_id", "organization_id");`)
    this.addSql(`create index "payments_fees_org_activity_idx" on "payments_fees" ("organization_id", "activity_id");`)
    this.addSql(`create index "payments_fees_org_group_idx" on "payments_fees" ("organization_id", "group_id");`)

    this.addSql(
      `create table "payments_settings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "auto_book_bank_matches" boolean not null default true, "coach_fee_access" text not null default 'collect', primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_settings_tenant_org_idx" on "payments_settings" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `alter table "payments_settings" add constraint "payments_settings_organization_unique" unique ("organization_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "payments_settings" cascade;`)
    this.addSql(`drop table if exists "payments_fees" cascade;`)
    this.addSql(`drop table if exists "payments_discount_rules" cascade;`)
    this.addSql(`drop table if exists "payments_charge_generations" cascade;`)
    this.addSql(`drop table if exists "payments_charges" cascade;`)
  }
}
