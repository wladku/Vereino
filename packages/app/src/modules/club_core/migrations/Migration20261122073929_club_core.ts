import { Migration } from '@mikro-orm/migrations'

// Issue #471 (E19-S05; club spec REQ-041, amendment B): `club_core_club_settings.former_participant_retention_months`
// (int, not null, default 12, 1–120), the months after which `people:retention-sweep` anonymises a former participant.
// Approved by the product owner on #471 (2026-11-22). Generated with `yarn db:generate` against an unreachable database
// (never applied to a dev or real one); `lock_timeout` added for the DDL on the existing table (S5.4). The check is named
// `club_core_club_settings_retention_months_check`: the name in the approval has 65 characters, over PostgreSQL's 63,
// and would be truncated. Additive: a `not null default` adds no table rewrite on PostgreSQL 11+, existing rows read 12
// (the default `lib/settings.ts` gives a club without a row), and the previous release works on the new schema.
export class Migration20261122073929_club_core extends Migration {
  override name = 'Migration20261122073929'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "club_core_club_settings" add "former_participant_retention_months" int not null default 12;`,
    )
    this.addSql(
      `alter table "club_core_club_settings" add constraint "club_core_club_settings_retention_months_check" check (former_participant_retention_months between 1 and 120);`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "club_core_club_settings" drop constraint if exists "club_core_club_settings_retention_months_check";`,
    )
    this.addSql(`alter table "club_core_club_settings" drop column if exists "former_participant_retention_months";`)
  }
}
