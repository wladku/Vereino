import { Migration } from '@mikro-orm/migrations'

// Issue #309 (E13-S07; people life-cycle spec phase L7, *Data Models*, migration C): `club_core_club_settings.consent_texts`
// (jsonb, default `{}`), the club's own consent texts `{ <key>: { text, changedAt } }` (club spec DD-39, DD-L11).
// Approved by the product owner on #255 (2026-11-16, item 3 of *Rollout*). Generated with `yarn db:generate` against an
// unreachable database (never applied to a dev or real one); `lock_timeout` added for the DDL on the existing table
// (S5.4). Additive: the previous release works on the new schema.
export class Migration20261119041542_club_core extends Migration {
  override name = 'Migration20261119041542'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" add "consent_texts" jsonb not null default '{}';`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_club_settings" drop column if exists "consent_texts";`)
  }
}
