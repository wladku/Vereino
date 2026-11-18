import { Migration } from '@mikro-orm/migrations';

export class Migration20261118151254_facilities extends Migration {

  override name = 'Migration20261118151254';

  override up(): void | Promise<void> {
    this.addSql(`create table "facilities_rental_links" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "token_hash" text not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "rental_id" uuid not null, "purpose" text not null, primary key ("id"));`);
    this.addSql(`alter table "facilities_rental_links" add constraint "facilities_rental_links_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create index "facilities_rental_links_tenant_org_idx" on "facilities_rental_links" ("tenant_id", "organization_id");`);
    this.addSql(`alter table "facilities_rental_links" add constraint "facilities_rental_links_org_rental_purpose_unique" unique ("organization_id", "rental_id", "purpose");`);
  }

}
