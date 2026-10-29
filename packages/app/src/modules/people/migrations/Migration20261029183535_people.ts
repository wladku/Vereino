import { Migration } from '@mikro-orm/migrations'

// Issue #27 (club spec phase 1 steps 4–5, DD-39, REQ-006, REQ-037): the guardian's two consents on the person —
// `share_contact_with_coaches_at` and `share_presence_with_guardians_at`, nullable timestamptz (set = given at that
// instant, null = never given or withdrawn). Generated with `yarn db:generate`; `lock_timeout` added for the DDL on
// the existing table (S5.4) and `down()` written by hand.
export class Migration20261029183535_people extends Migration {
  override name = 'Migration20261029183535'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "people_persons" add "share_contact_with_coaches_at" timestamptz null, add "share_presence_with_guardians_at" timestamptz null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "people_persons" drop column if exists "share_contact_with_coaches_at", drop column if exists "share_presence_with_guardians_at";`,
    )
  }
}
