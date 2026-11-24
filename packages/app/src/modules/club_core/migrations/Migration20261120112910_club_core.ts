import { Migration } from '@mikro-orm/migrations'

// Issue #486 (E20-S07; the owner approved this migration on 2026-11-20, decision 3 of epic #479): the club's own colour,
// `#rrggbb` or null, painting the member header bar, the public hero and the fallback logo. Generated with
// `yarn db:generate` (offline); `down()` written by hand. The column is nullable without a default, so PostgreSQL adds it
// without rewriting the table and the previous release ignores it (S14.6); `lock_timeout` is set for the DDL on the
// existing `club_core_club_settings` table (S5.4).
export class Migration20261120112910_club_core extends Migration {
  override name = 'Migration20261120112910'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" add "accent_color" text null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" drop column if exists "accent_color";`)
  }
}
