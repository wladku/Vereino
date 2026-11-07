import { Migration } from '@mikro-orm/migrations'

// Issue #114 (payments spec phase 4 step 8, REQ-031; the migration taken as approved on the owner's autonomous
// instruction of 2026-11-07, recorded on #114): cash accepted with "Accept cash" records who collected it and its
// `KP/YYYY/MM/NNN` receipt number. Both columns are nullable, so existing rows need no backfill. Generated with
// `yarn db:generate` (offline); `payments_payments` is a young, small table, so no `lock_timeout` is needed.

export class Migration20261107174635_payments extends Migration {
  override name = 'Migration20261107174635'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "payments_payments" add "collected_by_person_id" uuid null, add "receipt_number" text null;`,
    )
    this.addSql(
      `create index "payments_payments_org_collector_idx" on "payments_payments" ("organization_id", "collected_by_person_id", "paid_on");`,
    )
    this.addSql(
      `create index "payments_payments_org_receipt_idx" on "payments_payments" ("organization_id", "receipt_number");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "payments_payments_org_collector_idx";`)
    this.addSql(`drop index "payments_payments_org_receipt_idx";`)
    this.addSql(`alter table "payments_payments" drop column "collected_by_person_id", drop column "receipt_number";`)
  }
}
