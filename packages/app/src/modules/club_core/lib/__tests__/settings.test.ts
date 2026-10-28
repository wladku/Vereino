import { describe, expect, it } from '@jest/globals'
import {
  CLUB_SETTINGS_DEFAULTS,
  DEFAULT_DECLARATION_KINDS,
  applyClubSettingsPatch,
  clubSettingsPatchSchema,
  clubSettingsSchema,
  hasAtMostTwoDecimals,
  isAvailableSalesDocument,
  isTimeZone,
  mergeDeclarationKinds,
  resolveClubSettings,
  storedNumber,
} from '../settings'

describe('club settings', () => {
  it('declares the phase 1 defaults (D-022, DD-37)', () => {
    expect(CLUB_SETTINGS_DEFAULTS).toEqual({
      ownAccountMinAge: 16,
      defaultLocale: 'pl',
      timezone: 'Europe/Warsaw',
      shortName: null,
      currency: 'PLN',
      declarationKinds: {
        training: 'absence_only',
        match: 'confirm',
        sparring: 'confirm',
        tournament: 'confirm',
        camp: 'confirm',
        other: 'confirm',
      },
      onlineFeeMode: 'club_pays',
      onlineFeePercent: 0,
      onlineFeeFixed: 0,
      coachSettlementModel: 'units_per_contract',
      showCalledUpChildren: 'none',
      orderSalesDocument: 'none',
    })
    expect(clubSettingsSchema.parse(CLUB_SETTINGS_DEFAULTS)).toEqual(CLUB_SETTINGS_DEFAULTS)
  })

  it('recognises IANA time zones', () => {
    expect(isTimeZone('Europe/Warsaw')).toBe(true)
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false)
  })

  it('offers only the sales document "none" in 1.0', () => {
    expect(isAvailableSalesDocument('none')).toBe(true)
    expect(isAvailableSalesDocument('receipt')).toBe(false)
    expect(isAvailableSalesDocument('invoice')).toBe(false)
  })

  it('accepts percentages with at most two decimals', () => {
    expect(hasAtMostTwoDecimals(1.39)).toBe(true)
    expect(hasAtMostTwoDecimals(2)).toBe(true)
    expect(hasAtMostTwoDecimals(1.395)).toBe(false)
  })

  it('merges declaration kinds per activity type', () => {
    expect(mergeDeclarationKinds(DEFAULT_DECLARATION_KINDS, undefined)).toEqual(DEFAULT_DECLARATION_KINDS)
    expect(mergeDeclarationKinds(DEFAULT_DECLARATION_KINDS, { training: 'confirm' })).toEqual({
      ...DEFAULT_DECLARATION_KINDS,
      training: 'confirm',
    })
  })

  it('returns the defaults when the club has no stored row', () => {
    expect(resolveClubSettings(null)).toEqual({ values: CLUB_SETTINGS_DEFAULTS, invalidKeys: [] })
  })

  it('keeps valid stored values and defaults missing ones silently', () => {
    expect(
      resolveClubSettings({
        ownAccountMinAge: 13,
        defaultLocale: null,
        shortName: 'Dev Academy',
        declarationKinds: { match: 'absence_only' },
        onlineFeePercent: 1.5,
      }),
    ).toEqual({
      values: {
        ...CLUB_SETTINGS_DEFAULTS,
        ownAccountMinAge: 13,
        shortName: 'Dev Academy',
        declarationKinds: { ...DEFAULT_DECLARATION_KINDS, match: 'absence_only' },
        onlineFeePercent: 1.5,
      },
      invalidKeys: [],
    })
  })

  it('replaces each invalid stored value by its default and names it', () => {
    expect(
      resolveClubSettings({
        ownAccountMinAge: 99,
        defaultLocale: 'en',
        timezone: 'Nowhere/Land',
        currency: 'zloty',
        declarationKinds: { training: 'maybe' },
        orderSalesDocument: 'invoice',
      }),
    ).toEqual({
      values: { ...CLUB_SETTINGS_DEFAULTS, defaultLocale: 'en' },
      invalidKeys: ['ownAccountMinAge', 'timezone', 'currency', 'declarationKinds', 'orderSalesDocument'],
    })
  })

  it('validates a partial update field by field', () => {
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 14 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 0 }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ defaultLocale: 'Polish' }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ defaultLocale: 'pt-BR' }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ shortName: null }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ declarationKinds: { training: 'confirm' } }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ declarationKinds: { lesson: 'confirm' } }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ orderSalesDocument: 'receipt' }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ onlineFeePercent: 1.555 }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ onlineFeeFixed: 1.5 }).success).toBe(false)
  })

  it('applies a partial update and merges the declaration kinds', () => {
    const current = { ...CLUB_SETTINGS_DEFAULTS, shortName: 'Dev' }
    expect(applyClubSettingsPatch(current, {})).toEqual(current)
    expect(
      applyClubSettingsPatch(current, {
        shortName: null,
        onlineFeeMode: 'payer_pays',
        declarationKinds: { match: 'absence_only' },
      }),
    ).toEqual({
      ...current,
      shortName: null,
      onlineFeeMode: 'payer_pays',
      declarationKinds: { ...DEFAULT_DECLARATION_KINDS, match: 'absence_only' },
    })
  })

  it('reads stored decimals as numbers', () => {
    expect(storedNumber('1.50')).toBe(1.5)
    expect(storedNumber('abc')).toBe('abc')
    expect(storedNumber('  ')).toBe('  ')
    expect(storedNumber(2)).toBe(2)
    expect(storedNumber(null)).toBeNull()
  })
})
