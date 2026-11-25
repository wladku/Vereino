import { Migration } from '@mikro-orm/migrations'

// Issue #685 (training outlines spec phase 4, E24-S05, B-O1, BR-O4; the migration approved by the product owner on
// 2026-11-24 on #671): `club_core_club_settings.outline_library_max_visibility` (text, not null, default `clubs`), the
// widest level the club's coaches may publish training outlines at. Existing clubs read `clubs` (D-038 §4). Generated
// with `yarn db:generate` against an unreachable database (never applied to a dev or real one); `lock_timeout` added
// for the DDL on the existing table (S5.4). Additive: a `not null default` adds no table rewrite on PostgreSQL 11+, and
// the previous release works on the new schema.
export class Migration20261125092020_club_core extends Migration {
  override name = 'Migration20261125092020'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "club_core_club_settings" add "outline_library_max_visibility" text not null default 'clubs';`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" drop column if exists "outline_library_max_visibility";`)
  }
}
