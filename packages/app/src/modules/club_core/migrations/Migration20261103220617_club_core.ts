import { Migration } from '@mikro-orm/migrations'

// Issue #85 (UX parity spec phase 2, DD-U05 migration A): the section's short description for the public club page
// tile. Generated with `yarn db:generate`; the column is nullable, so the previous release ignores it, and
// `lock_timeout` is set for the DDL on the existing table (S5.4). The unique index on the section names is migration
// B (`Migration20261103220618_club_core`), on its own because it is built concurrently.
export class Migration20261103220617_club_core extends Migration {
  override name = 'Migration20261103220617'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_sections" add "short_description" varchar(160) null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_sections" drop column if exists "short_description";`)
  }
}
