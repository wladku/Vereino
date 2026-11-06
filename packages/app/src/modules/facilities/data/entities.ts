import { ArrayType, OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { ScopedEntityBase, decorateScopedEntityBase, type ScopedEntityOptionalProps } from '@vereino/db'
import type { ClosureReason } from '../lib/closures'
import type { RenterCategory } from '../lib/rates'
import type { Zone, ZoneSource } from '../lib/zones'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * A weekly zone rule of a place (facilities spec glossary *Zone*, *Booking availability*; DD-21; #121): weekdays,
 * wall-clock times in the club time zone, a zone, a priority and a validity period. Rules from the facility regulations
 * carry `source = regulations` (priority 1–2); the bulk booking availability writes `reservable_paid` rules with
 * `source = availability` and priority 3. Two live rules of a place with equal priority never overlap (409 on save,
 * serialized by the zone advisory lock). `place_id` is a scalar id of a `club_core` place.
 */
@Entity({ tableName: 'facilities_zone_rules' })
@Index({ name: 'facilities_zone_rules_org_place_idx', properties: ['organizationId', 'placeId'] })
@Index({ name: 'facilities_zone_rules_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ZoneRule extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'source' | 'validTo'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  /** ISO weekdays 1–7. */
  @Property({ name: 'weekdays', type: new ArrayType((value) => Number(value)), columnType: 'smallint[]' })
  weekdays!: number[]

  /** Wall time in the club zone (`HH:mm:ss`). */
  @Property({ name: 'time_from', type: 'time' })
  timeFrom!: string

  @Property({ name: 'time_to', type: 'time' })
  timeTo!: string

  @Property({ name: 'zone', type: 'text' })
  zone!: Zone

  @Property({ name: 'priority', type: 'smallint' })
  priority!: number

  @Property({ name: 'source', type: 'text', default: 'regulations' })
  source: ZoneSource = 'regulations'

  /** `YYYY-MM-DD`, inclusive. */
  @Property({ name: 'valid_from', type: 'date' })
  validFrom!: string

  /** `YYYY-MM-DD`, inclusive; null = open-ended. */
  @Property({ name: 'valid_to', type: 'date', nullable: true })
  validTo?: string | null
}

/**
 * A closure of a place (facilities spec glossary *Closure*, DD-22; #121): snow, an owner-ordered maintenance, a
 * municipal or school event. It blocks new bookings; on save the planned sessions on the place and its sub-places in
 * that time get the reschedule flag (rentals from E08-S02 on).
 */
@Entity({ tableName: 'facilities_closures' })
@Index({ name: 'facilities_closures_org_place_start_idx', properties: ['organizationId', 'placeId', 'startsAt'] })
@Index({ name: 'facilities_closures_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Closure extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'note'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'starts_at', type: Date })
  startsAt!: Date

  @Property({ name: 'ends_at', type: Date })
  endsAt!: Date

  @Property({ name: 'reason', type: 'text' })
  reason!: ClosureReason

  @Property({ name: 'note', type: 'text', nullable: true })
  note?: string | null
}

/**
 * A rental rate (facilities spec *Data Models* → `facilities_rental_rates`; #121): the price of one 90-minute unit for
 * a place and a renter category, in minor units, optionally for a season `MM-DD`–`MM-DD` and with lighting.
 */
@Entity({ tableName: 'facilities_rental_rates' })
@Index({
  name: 'facilities_rental_rates_org_place_category_idx',
  properties: ['organizationId', 'placeId', 'renterCategory'],
})
@Index({ name: 'facilities_rental_rates_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class RentalRate extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'seasonFrom' | 'seasonTo' | 'includesLighting' | 'validTo'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'renter_category', type: 'text' })
  renterCategory!: RenterCategory

  /** Minor units (grosz) per 90-minute unit; there is no 60-minute rate. */
  @Property({ name: 'price_per_90', type: 'int' })
  pricePer90!: number

  /** `MM-DD`; set together with `season_to`, or neither. */
  @Property({ name: 'season_from', type: 'text', nullable: true })
  seasonFrom?: string | null

  @Property({ name: 'season_to', type: 'text', nullable: true })
  seasonTo?: string | null

  @Property({ name: 'includes_lighting', type: 'boolean', default: false })
  includesLighting: boolean = false

  @Property({ name: 'valid_from', type: 'date' })
  validFrom!: string

  @Property({ name: 'valid_to', type: 'date', nullable: true })
  validTo?: string | null
}
