// The club's calendar: today's date in the club time zone, from `club_core`'s settings service (foundation spec
// DD-F16; resolved through DI with `hasRegistration`, so `people` degrades to the default zone without `club_core`).
import type { AwilixContainer } from 'awilix'
import { clubAccent, type CalendarDate, type ClubAccent } from '@vereino/core'
import type { ClubCoreSettingsService, ClubSettingsSnapshot } from '../../club_core/services/settings'
import { calendarDateInZone } from '../lib/people-rules'

/** DI token of `club_core`'s settings service. */
const CLUB_CORE_SETTINGS_SERVICE = 'clubCoreSettings'

/**
 * The club settings `people` reads: the account age threshold, the default locale, the time zone and the club's short
 * name (club content, shown in the club's language on `/club`).
 */
export type PeopleClubSettings = Pick<
  ClubSettingsSnapshot['values'],
  'ownAccountMinAge' | 'defaultLocale' | 'timezone' | 'shortName'
>

/** The default club zone and age threshold when `club_core` is not enabled (club spec DD-37 defaults). */
const FALLBACK_SETTINGS: PeopleClubSettings = {
  ownAccountMinAge: 16,
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
  shortName: null,
}

export type ClubScope = { tenantId: string; organizationId: string }

/** The club's effective settings (`club_core`), or the defaults when the module is absent. */
export async function clubSettings(container: AwilixContainer, scope: ClubScope): Promise<PeopleClubSettings> {
  if (!container.hasRegistration(CLUB_CORE_SETTINGS_SERVICE)) return FALLBACK_SETTINGS
  const service = container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE)
  return (await service.get(scope)).values
}

/** The club logo for the member header (#29): the authenticated image URL, or null (the header shows the name). */
export async function clubLogoUrl(container: AwilixContainer, scope: ClubScope): Promise<string | null> {
  if (!container.hasRegistration(CLUB_CORE_SETTINGS_SERVICE)) return null
  const service = container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE)
  return (await service.get(scope)).publicSettings.logoUrl
}

/** The club's colour for the member header bar (#486), or null (the default) without one or without `club_core`. */
export async function clubAccentOf(container: AwilixContainer, scope: ClubScope): Promise<ClubAccent | null> {
  if (!container.hasRegistration(CLUB_CORE_SETTINGS_SERVICE)) return null
  const service = container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE)
  return clubAccent((await service.get(scope)).publicSettings.accentColor)
}

/**
 * The club's own consent texts by key (`{ text, changedAt }`, club spec DD-39, people life-cycle spec DD-L11; #309).
 * A key without an entry uses the built-in text; without `club_core` every text is the built-in one.
 */
export type ClubConsentTexts = ClubSettingsSnapshot['consentTexts']

export async function clubConsentTexts(container: AwilixContainer, scope: ClubScope): Promise<ClubConsentTexts> {
  if (!container.hasRegistration(CLUB_CORE_SETTINGS_SERVICE)) return {}
  const service = container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE)
  return (await service.get(scope)).consentTexts
}

/** Today's calendar date in the club's time zone. */
export async function clubToday(
  container: AwilixContainer,
  scope: ClubScope,
  now: Date = new Date(),
): Promise<CalendarDate> {
  const { timezone } = await clubSettings(container, scope)
  return calendarDateInZone(now, timezone)
}
