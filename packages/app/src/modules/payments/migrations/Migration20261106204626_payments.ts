import { Migration } from '@mikro-orm/migrations'

// Issue #110 (payments spec phase 4 step 4, DD-42; the migration taken as approved on the owner's autonomous
// instruction of 2026-11-06, recorded on #110): the online checkout `payments_checkouts`, and on `payments_payments`
// the gateway transaction of an online payment (unique with the charge and the overpayment flag, so a repeated
// capture books nothing), the provider refund id of an online refund and the overpayment "to refund" flag (Q-049).
// Generated with `yarn db:generate` (offline); the change of the reversal index is hand-written. The changes are
// additive — a new table, nullable or defaulted columns and a narrower partial index — so the previous release ignores
// them (S14.6). `payments_payments` arrived one release earlier (#109) and is small, so its partial unique indexes
// need no concurrent build; `lock_timeout` is set for its DDL (S5.4).
export class Migration20261106204626_payments extends Migration {
  override name = 'Migration20261106204626'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `create table "payments_checkouts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "payer_person_id" uuid not null, "charge_ids" uuid[] not null, "amount" int not null, "fee_amount" int not null default 0, "idempotency_key" text not null, "gateway_transaction_id" uuid null, "status" text not null default 'created', "amount_mismatch" boolean not null default false, "last_checked_at" timestamptz null, primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_checkouts_tenant_org_idx" on "payments_checkouts" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_checkouts_org_payer_idx" on "payments_checkouts" ("organization_id", "payer_person_id");`,
    )
    this.addSql(
      `create index "payments_checkouts_org_status_created_idx" on "payments_checkouts" ("organization_id", "status", "created_at");`,
    )
    this.addSql(
      `alter table "payments_checkouts" add constraint "payments_checkouts_gateway_transaction_unique" unique ("gateway_transaction_id");`,
    )
    this.addSql(
      `alter table "payments_checkouts" add constraint "payments_checkouts_idempotency_key_unique" unique ("idempotency_key");`,
    )

    this.addSql(
      `alter table "payments_payments" add "gateway_transaction_id" uuid null, add "gateway_refund_id" text null, add "is_overpayment" boolean not null default false;`,
    )
    this.addSql(
      `create unique index "payments_payments_gateway_refund_unique" on "payments_payments" ("gateway_refund_id") where gateway_refund_id is not null and deleted_at is null;`,
    )
    this.addSql(
      `create unique index "payments_payments_gateway_charge_unique" on "payments_payments" ("gateway_transaction_id", "charge_id", "is_overpayment") where gateway_transaction_id is not null and reverses_payment_id is null and deleted_at is null;`,
    )
    // An online payment may be refunded in parts, so "one reversal per payment" now covers only the reversals of
    // cash and transfer payments; each refund is unique by its provider refund id instead. Hand-written: the
    // generator does not compare expression indexes.
    this.addSql(`drop index if exists "payments_payments_reverses_unique";`)
    this.addSql(
      `create unique index "payments_payments_reverses_unique" on "payments_payments" ("reverses_payment_id") where reverses_payment_id is not null and gateway_refund_id is null and deleted_at is null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`drop index if exists "payments_payments_reverses_unique";`)
    this.addSql(
      `create unique index "payments_payments_reverses_unique" on "payments_payments" ("reverses_payment_id") where reverses_payment_id is not null and deleted_at is null;`,
    )
    this.addSql(`drop index if exists "payments_payments_gateway_refund_unique";`)
    this.addSql(`drop index if exists "payments_payments_gateway_charge_unique";`)
    this.addSql(
      `alter table "payments_payments" drop column if exists "gateway_transaction_id", drop column if exists "gateway_refund_id", drop column if exists "is_overpayment";`,
    )
    this.addSql(`drop table if exists "payments_checkouts";`)
  }
}
