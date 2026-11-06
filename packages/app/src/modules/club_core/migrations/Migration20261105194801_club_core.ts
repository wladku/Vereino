import { Migration } from '@mikro-orm/migrations'

// Issue #121 (facilities spec DD-41, phase 5 step 2; approved by the product owner on 2026-11-05 on #121): a place's own
// opening hours, `{ seasons: [{ from, to, windows: [{ weekday, from, to }] }] }`, validated by `openingHoursProblem`
// (`@vereino/core`). Generated with `yarn db:generate`; the column is nullable, so the previous release ignores it, and
// `lock_timeout` is set for the DDL on the existing table (S5.4). No index: the hours are read by place id.
export class Migration20261105194801_club_core extends Migration {
  override name = 'Migration20261105194801'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_places" add "opening_hours" jsonb null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_places" drop column if exists "opening_hours";`)
  }
}
