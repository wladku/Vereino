import { Migration } from '@mikro-orm/migrations'

// Issue #126 (E08-S06; club spec *Data Models* → `people_role_assignments.place_id`, *Record scope* → `place_ids`): the
// place of a facility attendant's (`facility_operator`) assignment — nullable uuid, a scalar `club_core` place id —
// and its index. Approved by the product owner on #126 (2026-11-10). Generated with `yarn db:generate` against an
// unreachable database (never applied to a dev or real one); `lock_timeout` added for the DDL on the existing table
// (S5.4) and `down()` written by hand.
export class Migration20261110072012_people extends Migration {
  override name = 'Migration20261110072012'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "people_role_assignments" add "place_id" uuid null;`)
    this.addSql(
      `create index "people_role_assignments_org_place_idx" on "people_role_assignments" ("organization_id", "place_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`drop index if exists "people_role_assignments_org_place_idx";`)
    this.addSql(`alter table "people_role_assignments" drop column if exists "place_id";`)
  }
}
