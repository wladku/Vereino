import { Migration } from '@mikro-orm/migrations'

export class Migration20261108223622_payments extends Migration {
  override name = 'Migration20261108223622'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "payments_order_links" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "token_hash" text not null, "expires_at" timestamptz not null, "used_count" int not null default 0, "last_used_at" timestamptz null, "campaign_id" uuid not null, "guardian_person_id" uuid not null, primary key ("id"));`,
    )
    this.addSql(
      `alter table "payments_order_links" add constraint "payments_order_links_token_hash_unique" unique ("token_hash");`,
    )
    this.addSql(
      `create index "payments_order_links_tenant_org_idx" on "payments_order_links" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "payments_order_links_org_campaign_idx" on "payments_order_links" ("organization_id", "campaign_id");`,
    )
  }
}
