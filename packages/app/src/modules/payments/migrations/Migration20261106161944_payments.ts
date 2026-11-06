import { Migration } from '@mikro-orm/migrations'

// Issue #109 (payments spec phase 4 step 3; the migration taken as approved on the owner's autonomous instruction of
// 2026-11-06, recorded on #109): the payments of a charge - cash and transfer payments recorded by the administrator
// and their reversing entries, one reversal per payment (partial unique index). Generated with `yarn db:generate`
// (offline); it creates only a new table, so no `lock_timeout` is needed, and `down()` is written by hand.

export class Migration20261106161944_payments extends Migration {
  override name = 'Migration20261106161944'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "payments_payments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "charge_id" uuid not null, "amount" int not null, "method" text not null, "paid_on" date not null, "reference" text null, "recorded_by_person_id" uuid null, "recorded_by_user_id" uuid null, "reverses_payment_id" uuid null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "payments_payments_reverses_unique" on "payments_payments" ("reverses_payment_id") where reverses_payment_id is not null and deleted_at is null;`,
    )
    this.addSql(
      `create index "payments_payments_tenant_org_idx" on "payments_payments" ("tenant_id", "organization_id");`,
    )
    this.addSql(`create index "payments_payments_org_method_idx" on "payments_payments" ("organization_id", "method");`)
    this.addSql(
      `create index "payments_payments_org_charge_idx" on "payments_payments" ("organization_id", "charge_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "payments_payments" cascade;`)
  }
}
