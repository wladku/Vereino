import { Migration } from '@mikro-orm/migrations'

export class Migration20261108183817_payments extends Migration {
  override name = 'Migration20261108183817'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "payments_bank_imports" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "attachment_id" uuid not null, "file_name" text not null, "format" text not null, "column_profile" jsonb null, "imported_by_person_id" uuid null, "imported_by_user_id" uuid null, "total" int not null, "booked" int not null, "suggested" int not null, "unmatched" int not null, "skipped" int not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_bank_imports_tenant_org_idx" on "payments_bank_imports" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_bank_imports_org_created_idx" on "payments_bank_imports" ("organization_id", "created_at");`,
    )

    this.addSql(
      `create table "payments_bank_transactions" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "import_id" uuid not null, "line" int not null, "booked_on" date not null, "amount" int not null, "counterparty_name" text null, "counterparty_account" text null, "title" text not null, "tx_hash" text not null, "status" text not null, "payer_person_id" uuid null, "allocation" jsonb not null, "match_reason" text not null, "auto_booked" boolean not null default false, "skip_reason" text null, "skip_note" text null, "decided_by_person_id" uuid null, "decided_by_user_id" uuid null, "decided_at" timestamptz null, primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_bank_transactions_tenant_org_idx" on "payments_bank_transactions" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_bank_transactions_org_import_idx" on "payments_bank_transactions" ("organization_id", "import_id");`,
    )
    this.addSql(
      `create index "payments_bank_transactions_org_status_idx" on "payments_bank_transactions" ("organization_id", "status", "booked_on");`,
    )
    this.addSql(
      `alter table "payments_bank_transactions" add constraint "payments_bank_transactions_org_hash_unique" unique ("organization_id", "tx_hash");`,
    )

    this.addSql(`alter table "payments_payments" add "bank_transaction_id" uuid null;`)
    this.addSql(
      `create index "payments_payments_org_bank_transaction_idx" on "payments_payments" ("organization_id", "bank_transaction_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "payments_payments_org_bank_transaction_idx";`)
    this.addSql(`alter table "payments_payments" drop column "bank_transaction_id";`)
  }
}
