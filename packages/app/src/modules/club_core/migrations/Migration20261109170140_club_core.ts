import { Migration } from '@mikro-orm/migrations'

// Issue #195 (E06-S07b; the owner chose option 2 and approved this migration on 2026-11-08, recorded on #195): the URLs
// of the club's rules and privacy policy, linked in the footer of every public page when set. Generated with
// `yarn db:generate` (offline); `down()` written by hand. Both columns are nullable without a default, so PostgreSQL
// adds them without rewriting the table and the previous release ignores them (S14.6); `lock_timeout` is set for the
// DDL on the existing `club_core_club_settings` table (S5.4).
export class Migration20261109170140_club_core extends Migration {
  override name = 'Migration20261109170140'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" add "rules_url" text null, add "privacy_policy_url" text null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "club_core_club_settings" drop column if exists "rules_url", drop column if exists "privacy_policy_url";`,
    )
  }
}
