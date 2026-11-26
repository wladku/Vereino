import { Migration } from '@mikro-orm/migrations'

// The two-sided cash handover (payments spec DD-31a, REQ-033a; D-042, #791; the migration approved by the owner on #791,
// 2026-11-26): the handover's status (`pending`, `confirmed`, `rejected`, `withdrawn`), who sent it and when, who decided
// it and when, the rejection reason, and the payment's reservation by a pending handover. Additive: every handover
// before it was accepted one-sided, so it is `confirmed`, decided when it was created by the person who received it.

export class Migration20261125232526_payments extends Migration {
  override name = 'Migration20261125232526'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "payments_cash_handovers" add "status" text not null default 'confirmed', add "started_by_person_id" uuid null, add "started_by_user_id" uuid null, add "sent_at" timestamptz null, add "decided_at" timestamptz null, add "decided_by_person_id" uuid null, add "decided_by_user_id" uuid null, add "rejection_reason" text null;`,
    )
    this.addSql(
      `update "payments_cash_handovers" set "decided_at" = "created_at", "decided_by_person_id" = "received_by_person_id", "decided_by_user_id" = "received_by_user_id";`,
    )
    this.addSql(
      `create index "payments_cash_handovers_org_status_sent_idx" on "payments_cash_handovers" ("organization_id", "status", "sent_at");`,
    )

    this.addSql(`alter table "payments_payments" add "pending_cash_handover_id" uuid null;`)
    this.addSql(
      `create index "payments_payments_org_pending_cash_handover_idx" on "payments_payments" ("organization_id", "pending_cash_handover_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "payments_cash_handovers_org_status_sent_idx";`)
    this.addSql(
      `alter table "payments_cash_handovers" drop column "status", drop column "started_by_person_id", drop column "started_by_user_id", drop column "sent_at", drop column "decided_at", drop column "decided_by_person_id", drop column "decided_by_user_id", drop column "rejection_reason";`,
    )

    this.addSql(`drop index "payments_payments_org_pending_cash_handover_idx";`)
    this.addSql(`alter table "payments_payments" drop column "pending_cash_handover_id";`)
  }
}
