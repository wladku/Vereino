import { Migration } from '@mikro-orm/migrations'

// Migration D of the payments parity spec (#298, approved on #254): each charge's share of an online checkout, parallel
// to `charge_ids` (DD-C07). Existing checkouts keep null and are fulfilled by the spread of the amounts due.
export class Migration20261117031109_payments extends Migration {
  override name = 'Migration20261117031109'

  override up(): void | Promise<void> {
    this.addSql(`alter table "payments_checkouts" add "charge_amounts" int[] null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "payments_checkouts" drop column "charge_amounts";`)
  }
}
