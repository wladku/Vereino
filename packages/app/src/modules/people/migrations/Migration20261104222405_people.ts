import { Migration } from '@mikro-orm/migrations'

// Issue #91 (E06-S09; club spec DD-29, REQ-025): the instructor's consent to publish their name on the club's public
// pages — `publish_name_consent_at`, nullable timestamptz (set = given at that instant, null = never given or
// withdrawn). Approved by the product owner on #91 (2026-11-04). Generated with `yarn db:generate` against a throwaway
// database; `lock_timeout` added for the DDL on the existing table (S5.4) and `down()` written by hand.
export class Migration20261104222405_people extends Migration {
  override name = 'Migration20261104222405'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "people_persons" add "publish_name_consent_at" timestamptz null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "people_persons" drop column if exists "publish_name_consent_at";`)
  }
}
