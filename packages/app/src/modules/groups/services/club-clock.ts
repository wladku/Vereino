// The club's calendar day for `groups`: today in the club time zone from `club_core`'s settings service
// (`clubCoreSettings`, foundation spec DD-F16). Membership periods are calendar dates in that zone.
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'

/** `club_core`'s settings token (`CLUB_CORE_SETTINGS_SERVICE` in `club_core/di.ts`). */
const CLUB_CORE_SETTINGS_SERVICE = 'clubCoreSettings'
/** The club spec default zone (DD-37), used only when `club_core` is not registered. */
const FALLBACK_TIME_ZONE = 'Europe/Warsaw'

export async function clubToday(
  container: AwilixContainer,
  scope: { tenantId: string; organizationId: string },
  now: Date = new Date(),
): Promise<CalendarDate> {
  if (!container.hasRegistration(CLUB_CORE_SETTINGS_SERVICE)) return calendarDateInZone(now, FALLBACK_TIME_ZONE)
  const settings = await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE).get(scope)
  return calendarDateInZone(now, settings.values.timezone)
}
