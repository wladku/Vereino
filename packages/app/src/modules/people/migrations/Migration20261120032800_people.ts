import { Migration } from '@mikro-orm/migrations'

// Issue #308 (E13-S06; people life-cycle spec phase L6, *Data Models*, migration B): `people_persons.anonymized_at`
// (timestamptz, null; set once by `people.persons.anonymize`) and `erasure_hold_until` (date, null; the retention hold
// of DD-L07) with a partial index for the daily job's step 5. Approved by the product owner on #255 (2026-11-16, item 2
// of *Rollout*). Generated with `yarn db:generate` against an unreachable database (never applied to a dev or real
// one); `lock_timeout` added for the DDL on the existing table (S5.4). Additive: the previous release works on the new
// schema.
export class Migration20261120032800_people extends Migration {
  override name = 'Migration20261120032800'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `alter table "people_persons" add "anonymized_at" timestamptz null, add "erasure_hold_until" date null;`,
    )
    this.addSql(
      `create index "people_persons_org_erasure_hold_idx" on "people_persons" ("organization_id", "erasure_hold_until") where erasure_hold_until is not null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`drop index if exists "people_persons_org_erasure_hold_idx";`)
    this.addSql(
      `alter table "people_persons" drop column if exists "anonymized_at", drop column if exists "erasure_hold_until";`,
    )
  }
}
