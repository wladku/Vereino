import { Migration } from '@mikro-orm/migrations'

// Issue #312 (E13-S10; people life-cycle spec phase L10, *Data Models*, migration D, `club_core` half):
// `club_core_contracts.attachment_id` (uuid, null), the signed contract PDF in the private `attachments` partition
// (REQ-L12). Approved by the product owner on #255 (2026-11-16, item 4 of *Rollout*). Generated with `yarn db:generate`
// against an unreachable database (never applied to a dev or real one); `lock_timeout` added for the DDL on the existing
// table (S5.4). Additive: the previous release works on the new schema.
export class Migration20261119080936_club_core extends Migration {
  override name = 'Migration20261119080936'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_contracts" add "attachment_id" uuid null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_contracts" drop column if exists "attachment_id";`)
  }
}
