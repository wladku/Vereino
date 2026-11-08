import { Migration } from '@mikro-orm/migrations'

// Issue #111 (payments spec phase 4 step 5, REQ-030; the migration taken as approved on the owner's autonomous
// instruction of 2026-11-08, recorded on #111): `payments_payer_refs`, each payer's permanent `GW-XXXX` code, unique
// per person and per code within the club. A new, empty table: codes are assigned on first use, so no backfill.
// Generated with `yarn db:generate` (offline).

export class Migration20261108105717_payments extends Migration {
  override name = 'Migration20261108105717'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "payments_payer_refs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "person_id" uuid not null, "code" text not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "payments_payer_refs_tenant_org_idx" on "payments_payer_refs" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `alter table "payments_payer_refs" add constraint "payments_payer_refs_org_code_unique" unique ("organization_id", "code");`,
    )
    this.addSql(
      `alter table "payments_payer_refs" add constraint "payments_payer_refs_org_person_unique" unique ("organization_id", "person_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "payments_payer_refs" cascade;`)
  }
}
