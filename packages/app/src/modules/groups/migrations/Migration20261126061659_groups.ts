import { Migration } from '@mikro-orm/migrations'

export class Migration20261126061659_groups extends Migration {
  override name = 'Migration20261126061659'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "groups_groups" add "places_limit" smallint null, add "accepts_applications" boolean not null default true;`,
    )
    this.addSql(
      `alter table "groups_groups" add constraint "groups_groups_places_limit_check" check (places_limit between 1 and 500);`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "groups_groups" drop constraint if exists "groups_groups_places_limit_check";`)
    this.addSql(`alter table "groups_groups" drop column "places_limit", drop column "accepts_applications";`)
  }
}
