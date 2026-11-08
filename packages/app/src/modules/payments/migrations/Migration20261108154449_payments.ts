import { Migration } from '@mikro-orm/migrations';

export class Migration20261108154449_payments extends Migration {

  override name = 'Migration20261108154449';

  override up(): void | Promise<void> {
    this.addSql(`create table "payments_orders" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "campaign_id" uuid not null, "participant_person_id" uuid not null, "ordered_by_person_id" uuid not null, "contact_email" text null, "contact_phone" text null, "print_name" text null, "print_number" int null, "notes" text null, "status" text not null default 'submitted', "charge_id" uuid not null, "submitted_via" text not null default 'app', "handed_over_at" timestamptz null, "handed_over_by_person_id" uuid null, primary key ("id"));`);
    this.addSql(`create unique index "payments_orders_campaign_participant_unique" on "payments_orders" ("campaign_id", "participant_person_id") where status = 'submitted' and deleted_at is null;`);
    this.addSql(`create index "payments_orders_tenant_org_idx" on "payments_orders" ("tenant_id", "organization_id");`);
    this.addSql(`create index "payments_orders_org_campaign_idx" on "payments_orders" ("organization_id", "campaign_id");`);

    this.addSql(`create table "payments_order_campaigns" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "description" text null, "section_id" uuid not null, "group_ids" uuid[] not null, "closes_on" date not null, "payment_due_on" date not null, "status" text not null default 'draft', "ask_print_name" boolean not null default false, "ask_print_number" boolean not null default false, "notes_label" text null, "supplier_name" text null, "created_by_person_id" uuid null, primary key ("id"));`);
    this.addSql(`create index "payments_order_campaigns_tenant_org_idx" on "payments_order_campaigns" ("tenant_id", "organization_id");`);
    this.addSql(`create index "payments_order_campaigns_org_status_idx" on "payments_order_campaigns" ("organization_id", "status");`);

    this.addSql(`create table "payments_order_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "order_id" uuid not null, "product_id" uuid not null, "size" text null, "component_sizes" jsonb null, "unit_price" int not null, primary key ("id"));`);
    this.addSql(`create index "payments_order_lines_tenant_org_idx" on "payments_order_lines" ("tenant_id", "organization_id");`);
    this.addSql(`create index "payments_order_lines_org_product_idx" on "payments_order_lines" ("organization_id", "product_id");`);
    this.addSql(`create index "payments_order_lines_order_idx" on "payments_order_lines" ("order_id");`);

    this.addSql(`create table "payments_order_products" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "campaign_id" uuid not null, "name" text not null, "kind" text not null, "component_product_ids" uuid[] not null, "sizes_child" text[] not null, "sizes_adult" text[] not null, "price_child" int not null, "price_adult" int null, "required_answer" boolean not null default false, "sort" int not null, primary key ("id"));`);
    this.addSql(`create index "payments_order_products_tenant_org_idx" on "payments_order_products" ("tenant_id", "organization_id");`);
    this.addSql(`create index "payments_order_products_campaign_sort_idx" on "payments_order_products" ("campaign_id", "sort");`);
  }

}
