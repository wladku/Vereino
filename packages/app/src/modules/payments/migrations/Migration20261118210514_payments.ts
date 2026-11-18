import { Migration } from '@mikro-orm/migrations'

export class Migration20261118210514_payments extends Migration {
  override name = 'Migration20261118210514'

  override up(): void | Promise<void> {
    this.addSql(`alter table "payments_settings" add "online_methods" text[] not null default '{card}';`)
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "payments_settings" drop column "online_methods";`)
  }
}
