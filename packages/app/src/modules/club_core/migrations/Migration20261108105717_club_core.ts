import { Migration } from '@mikro-orm/migrations'

// Issue #111 (payments spec phase 4 step 5; the migration taken as approved on the owner's autonomous instruction of
// 2026-11-08, recorded on #111): the club's own bank account, shown to payers in the transfer instructions with their
// payer code. Nullable, so existing rows need no backfill. Generated with `yarn db:generate` (offline).

export class Migration20261108105717_club_core extends Migration {
  override name = 'Migration20261108105717'

  override up(): void | Promise<void> {
    this.addSql(`alter table "club_core_club_settings" add "bank_account" text null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "club_core_club_settings" drop column "bank_account";`)
  }
}
