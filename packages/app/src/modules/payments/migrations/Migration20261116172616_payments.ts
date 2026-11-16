import { Migration } from '@mikro-orm/migrations'

// Migration A2 of the payments parity spec (#291, approved on #254; BACKWARD_COMPATIBILITY.md §5): the lookup of
// `payments.chargeService` by source and one live rental charge per rental. `yarn db:generate` emitted both indexes
// with the columns of migration A1; they are split here by hand and built `CONCURRENTLY`, so this migration runs
// outside a transaction (precedent `club_core/migrations/Migration20261103220618`). No rental charge exists before
// this release, so the unique index cannot fail on data; a build left invalid by a concurrent writer fails the run.
export class Migration20261116172616_payments extends Migration {
  override name = 'Migration20261116172616'

  override isTransactional(): boolean {
    return false
  }

  override up(): void | Promise<void> {
    this.addSql(`set lock_timeout = '5s';`)
    this.addSql(
      `create index concurrently if not exists "payments_charges_org_source_idx" on "payments_charges" ("organization_id", "source_type", "source_id");`,
    )
    this.addSql(
      `create unique index concurrently if not exists "payments_charges_org_rental_unique" on "payments_charges" ("organization_id", "source_id") where source_type = 'rental' and status <> 'cancelled' and deleted_at is null;`,
    )
    this.addSql(`reset lock_timeout;`)
    this.addSql(`do $$
begin
  if exists (
    select 1 from pg_index join pg_class on pg_class.oid = pg_index.indexrelid
    where pg_class.relname in ('payments_charges_org_source_idx', 'payments_charges_org_rental_unique')
      and not pg_index.indisvalid
  ) then
    raise exception 'a payments_charges index of migration A2 is invalid: drop it and re-run the migration';
  end if;
end $$;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index concurrently if exists "payments_charges_org_rental_unique";`)
    this.addSql(`drop index concurrently if exists "payments_charges_org_source_idx";`)
  }
}
