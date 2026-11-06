import { Migration } from '@mikro-orm/migrations'

// Issue #92 (club spec REQ-019, phase 2 step 1; approved by the product owner in D-030): a team's PZPN age category, an
// entry id of the club's `dictionaries` dictionary. Generated with `yarn db:generate`; the column is nullable, so the
// previous release ignores it, and `lock_timeout` is set for the DDL on the existing table (S5.4). No index: the
// category filter runs on the few groups of one organization, which `groups_groups_tenant_org_idx` already narrows.
export class Migration20261105091137_groups extends Migration {
  override name = 'Migration20261105091137'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "groups_groups" add "age_category_entry_id" uuid null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "groups_groups" drop column if exists "age_category_entry_id";`)
  }
}
