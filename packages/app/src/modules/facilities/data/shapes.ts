// The pure shapes of a stored zone rule and rental rate (`lib/zones.ts`, `lib/rates.ts`). They live outside the
// command files because those register their commands on import: a module that `di.ts` loads (the public places
// block, #124) must not import a command file, or the CLI registers the commands twice.
import { wallTimeOf, type ZoneRuleShape } from '../lib/zones'
import type { RentalRateShape } from '../lib/rates'
import type { RentalRate, ZoneRule } from './entities'

export function zoneRuleShapeOf(row: ZoneRule): ZoneRuleShape {
  return {
    id: row.id,
    placeId: row.placeId,
    weekdays: [...row.weekdays].sort((a, b) => a - b),
    timeFrom: wallTimeOf(row.timeFrom),
    timeTo: wallTimeOf(row.timeTo),
    zone: row.zone,
    priority: row.priority,
    source: row.source,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}

export function rentalRateShapeOf(row: RentalRate): RentalRateShape {
  return {
    id: row.id,
    placeId: row.placeId,
    renterCategory: row.renterCategory,
    pricePer90: row.pricePer90,
    seasonFrom: row.seasonFrom ?? null,
    seasonTo: row.seasonTo ?? null,
    includesLighting: row.includesLighting,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}
