import { Migration } from '@mikro-orm/migrations'

// Issue #26 (club spec phase 1 step 3): the guardianship relation, primary-payer flag and consents with the partial
// unique index of one open-ended primary payer per ward, and the person's encrypted phone and notes. Generated with
// `yarn db:generate`; `lock_timeout` added for the DDL on the existing tables (S5.4) and `down()` written by hand.
export class Migration20261029073716_people extends Migration {
  override name = 'Migration20261029073716'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)

    this.addSql(
      `alter table "people_guardianships" add "relation" text not null default 'parent', add "is_primary_payer" boolean not null default false, add "consents" jsonb not null default '{}';`,
    )
    this.addSql(
      `create unique index "people_guardianships_org_ward_primary_payer_unique" on "people_guardianships" ("organization_id", "ward_person_id") where is_primary_payer and deleted_at is null and valid_to is null;`,
    )

    this.addSql(`alter table "people_persons" add "phone" text null, add "notes" text null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`drop index if exists "people_guardianships_org_ward_primary_payer_unique";`)
    this.addSql(
      `alter table "people_guardianships" drop column if exists "relation", drop column if exists "is_primary_payer", drop column if exists "consents";`,
    )
    this.addSql(`alter table "people_persons" drop column if exists "phone", drop column if exists "notes";`)
  }
}
