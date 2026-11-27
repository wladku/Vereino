import { Migration } from '@mikro-orm/migrations'

export class Migration20261126215230_people extends Migration {
  override name = 'Migration20261126215230'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "people_invitation_links" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "token_hash" text not null, "expires_at" timestamptz not null, "used_count" int not null default 0, "last_used_at" timestamptz null, "person_id" uuid not null, "user_id" uuid not null, "created_by_user_id" uuid not null, "revoked_at" timestamptz null, primary key ("id"));`,
    )
    this.addSql(
      `alter table "people_invitation_links" add constraint "people_invitation_links_token_hash_unique" unique ("token_hash");`,
    )
    this.addSql(
      `create index "people_invitation_links_org_person_idx" on "people_invitation_links" ("tenant_id", "organization_id", "person_id");`,
    )
  }
}
