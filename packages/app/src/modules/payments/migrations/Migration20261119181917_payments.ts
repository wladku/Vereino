import { Migration } from '@mikro-orm/migrations'

// Cash handovers (payments spec *Data Models* → `payments_cash_handovers`; E07-S11, #118, B-33; the migration approved
// on #118 on the owner's autonomous instruction of 2026-11-19): the numbered `RG/YYYY/MM/NNN` handover and the
// payment's `cash_handover_id`. Additive.

export class Migration20261119181917_payments extends Migration {
  override name = 'Migration20261119181917'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "payments_cash_handovers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "number" text not null, "collector_person_id" uuid not null, "received_by_person_id" uuid null, "received_by_user_id" uuid null, "amount" int not null, "payment_ids" uuid[] not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_cash_handovers_tenant_org_idx" on "payments_cash_handovers" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_cash_handovers_org_created_idx" on "payments_cash_handovers" ("organization_id", "created_at");`,
    )
    this.addSql(
      `create index "payments_cash_handovers_org_collector_idx" on "payments_cash_handovers" ("organization_id", "collector_person_id", "created_at");`,
    )
    this.addSql(
      `alter table "payments_cash_handovers" add constraint "payments_cash_handovers_org_number_unique" unique ("organization_id", "number");`,
    )

    this.addSql(`alter table "payments_payments" add "cash_handover_id" uuid null;`)
    this.addSql(
      `create index "payments_payments_org_cash_handover_idx" on "payments_payments" ("organization_id", "cash_handover_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "payments_payments_org_cash_handover_idx";`)
    this.addSql(`alter table "payments_payments" drop column "cash_handover_id";`)

    this.addSql(`drop table if exists "payments_cash_handovers" cascade;`)
  }
}
