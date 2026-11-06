import { Migration } from '@mikro-orm/migrations'

// Issue #91 (E06-S09; club spec phase 2 step 9, DD-29, REQ-025): the public fields of a group — `is_public` (not null,
// default false, so every existing group stays off the public page), `public_description`, `public_conditions`,
// `age_from` and `age_to` (smallint, nullable; from ≤ to is checked by the `groups` commands) and `level_label`.
// Approved by the product owner on #91 (2026-11-04). Generated with `yarn db:generate` against a throwaway database;
// `lock_timeout` added for the DDL on the existing table (S5.4) and `down()` written by hand.
export class Migration20261104222405_groups extends Migration {
  override name = 'Migration20261104222405'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "groups_groups" add "is_public" boolean not null default false, add "public_description" text null, add "public_conditions" text null, add "age_from" smallint null, add "age_to" smallint null, add "level_label" text null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "groups_groups" drop column if exists "is_public", drop column if exists "public_description", drop column if exists "public_conditions", drop column if exists "age_from", drop column if exists "age_to", drop column if exists "level_label";`,
    )
  }
}
