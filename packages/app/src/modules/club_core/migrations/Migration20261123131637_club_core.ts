import { Migration } from '@mikro-orm/migrations';

export class Migration20261123131637_club_core extends Migration {

  override name = 'Migration20261123131637';

  override up(): void | Promise<void> {
    this.addSql(`alter table "club_core_club_settings" add "offboarding_notice_at" timestamptz null, add "offboarding_delete_after" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "club_core_club_settings" drop column "offboarding_notice_at", drop column "offboarding_delete_after";`);
  }

}
