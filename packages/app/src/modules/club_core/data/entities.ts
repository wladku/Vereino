import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { ScopedEntityBase, decorateScopedEntityBase, type ScopedEntityOptionalProps } from '@vereino/db'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * The club's settings, one row per organization (club spec DD-02, DD-37; foundation spec DD-F16). Phase A1 holds
 * only the three settings issue #38 needs; #25 (E02-S01) adds the remaining columns of the club spec row. A club
 * without a row reads the defaults of `lib/settings.ts`; the first update creates the row.
 */
@Entity({ tableName: 'club_core_club_settings' })
@Unique({ name: 'club_core_club_settings_organization_unique', properties: ['organizationId'] })
@Index({ name: 'club_core_club_settings_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ClubSettings extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'ownAccountMinAge' | 'defaultLocale' | 'timezone'

  @Property({ name: 'own_account_min_age', type: 'int', default: 16 })
  ownAccountMinAge: number = 16

  @Property({ name: 'default_locale', type: 'text', default: 'pl' })
  defaultLocale: string = 'pl'

  @Property({ name: 'timezone', type: 'text', default: 'Europe/Warsaw' })
  timezone: string = 'Europe/Warsaw'
}
