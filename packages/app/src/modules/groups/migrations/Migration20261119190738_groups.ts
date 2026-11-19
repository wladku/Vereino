import { Migration } from '@mikro-orm/migrations'

// Issue #384 — migration E of the people life-cycle spec (REQ-L16, DD-L17; Ask First item 15, approved by the product
// owner on 2026-11-19): the PZPN "U" range of each age category, keyed by the entry of the club's `dictionaries` age
// category dictionary. The table and its indexes are generated with `yarn db:generate`; the seed is hand-written: every
// club whose dictionary still has an entry with one of the nine default values (`PZPN_AGE_CATEGORIES` in
// `groups/lib/groups-rules.ts`) gets that entry's default range, so the previous release, which never reads the table,
// is unaffected. A new table only, so no lock on an existing one is taken.
export class Migration20261119190738_groups extends Migration {
  override name = 'Migration20261119190738'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "groups_age_category_ranges" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "entry_id" uuid not null, "u_from" smallint not null, "u_to" smallint null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "groups_age_category_ranges_org_entry_unique" on "groups_age_category_ranges" ("organization_id", "entry_id") where deleted_at is null;`,
    )
    this.addSql(
      `create index "groups_age_category_ranges_tenant_org_idx" on "groups_age_category_ranges" ("tenant_id", "organization_id");`,
    )
    // Hand-written seed for existing clubs (the default values and ranges of `PZPN_AGE_CATEGORIES`).
    this.addSql(
      `insert into "groups_age_category_ranges" ("organization_id", "tenant_id", "created_at", "updated_at", "entry_id", "u_from", "u_to")
       select e."organization_id", e."tenant_id", now(), now(), e."id", v."u_from", v."u_to"
       from "dictionary_entries" e
       join "dictionaries" d on d."id" = e."dictionary_id"
         and d."key" = 'groups.age_categories'
         and d."deleted_at" is null
         and d."organization_id" = e."organization_id"
         and d."tenant_id" = e."tenant_id"
       join (values
         ('kids', 4, 5),
         ('skrzat', 6, 7),
         ('zak', 8, 9),
         ('orlik', 10, 11),
         ('mlodzik', 12, 13),
         ('trampkarz', 14, 15),
         ('junior_mlodszy', 16, 17),
         ('junior_starszy', 18, 19),
         ('senior', 20, null)
       ) as v("value", "u_from", "u_to") on v."value" = e."value"
       on conflict do nothing;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "groups_age_category_ranges" cascade;`)
  }
}
