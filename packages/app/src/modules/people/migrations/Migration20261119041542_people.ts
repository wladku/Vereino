import { Migration } from '@mikro-orm/migrations'

// Issue #309 (E13-S07; people life-cycle spec phase L7, *Data Models*, migration C): `people_persons.consents` (jsonb,
// default `{}`), an adult participant's own consents in the `StoredConsents` shape of the guardianship (REQ-L10,
// DD-L12). Approved by the product owner on #255 (2026-11-16, item 3 of *Rollout*). Generated with `yarn db:generate`
// against an unreachable database (never applied to a dev or real one); `lock_timeout` added for the DDL on the existing
// table (S5.4). Additive: the previous release works on the new schema.
export class Migration20261119041542_people extends Migration {
  override name = 'Migration20261119041542'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "people_persons" add "consents" jsonb not null default '{}';`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "people_persons" drop column if exists "consents";`)
  }
}
