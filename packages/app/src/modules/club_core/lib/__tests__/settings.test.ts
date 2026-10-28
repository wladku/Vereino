import { describe, expect, it } from '@jest/globals'
import {
  CLUB_SETTINGS_DEFAULTS,
  clubSettingsPatchSchema,
  clubSettingsSchema,
  isTimeZone,
  resolveClubSettings,
} from '../settings'

describe('club settings', () => {
  it('declares the phase 1 defaults (D-022, DD-37)', () => {
    expect(CLUB_SETTINGS_DEFAULTS).toEqual({ ownAccountMinAge: 16, defaultLocale: 'pl', timezone: 'Europe/Warsaw' })
    expect(clubSettingsSchema.parse(CLUB_SETTINGS_DEFAULTS)).toEqual(CLUB_SETTINGS_DEFAULTS)
  })

  it('recognises IANA time zones', () => {
    expect(isTimeZone('Europe/Warsaw')).toBe(true)
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false)
  })

  it('returns the defaults when the club has no stored row', () => {
    expect(resolveClubSettings(null)).toEqual({ values: CLUB_SETTINGS_DEFAULTS, invalidKeys: [] })
  })

  it('keeps valid stored values and defaults missing ones silently', () => {
    expect(resolveClubSettings({ ownAccountMinAge: 13, defaultLocale: null })).toEqual({
      values: { ownAccountMinAge: 13, defaultLocale: 'pl', timezone: 'Europe/Warsaw' },
      invalidKeys: [],
    })
  })

  it('replaces each invalid stored value by its default and names it', () => {
    expect(resolveClubSettings({ ownAccountMinAge: 99, defaultLocale: 'en', timezone: 'Nowhere/Land' })).toEqual({
      values: { ownAccountMinAge: 16, defaultLocale: 'en', timezone: 'Europe/Warsaw' },
      invalidKeys: ['ownAccountMinAge', 'timezone'],
    })
  })

  it('validates a partial update field by field', () => {
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 14 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 0 }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ defaultLocale: 'Polish' }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ defaultLocale: 'pt-BR' }).success).toBe(true)
  })
})
