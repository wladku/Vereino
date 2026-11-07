import { Migration } from '@mikro-orm/migrations'

// Issue #199 (club spec DD-37; approved by the owner on 2026-11-06): the club setting `coach_may_cancel`, whether a
// coach may cancel a session. Generated with `yarn db:generate`; `down()` written by hand. The column is additive and
// has a constant default, so PostgreSQL adds it without rewriting the table and the previous release ignores it
// (S14.6); `lock_timeout` is set for the DDL on the existing `club_core_club_settings` table (S5.4).
export class Migration20261106211413_club_core extends Migration {
  override name = 'Migration20261106211413'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" add "coach_may_cancel" boolean not null default true;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" drop column if exists "coach_may_cancel";`)
  }
}
