import { Migration } from '@mikro-orm/migrations'

export class Migration20261125054144_people extends Migration {
  override name = 'Migration20261125054144'

  override up(): void | Promise<void> {
    this.addSql(`alter table "people_persons" add "medical_valid_until" text null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "people_persons" drop column "medical_valid_until";`)
  }
}
