import { describe, expect, it } from '@jest/globals'
import {
  CLUB_SETTINGS_DEFAULTS,
  DEFAULT_DECLARATION_KINDS,
  applyClubSettingsPatch,
  clubSettingsRuleProblem,
  clubSettingsPatchSchema,
  clubSettingsSchema,
  hasAtMostTwoDecimals,
  APPLICATION_ANSWER_DAYS_RANGE,
  APPLICATION_INFORMATION_MAX_LENGTH,
  isAvailableSalesDocument,
  isMonthDay,
  isTimeZone,
  monthDayOf,
  parseMonthDay,
  mergeDeclarationKinds,
  resolveClubSettings,
  storedNumber,
  timeZoneOptions,
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
      coachMayCancel: true,
      orderSalesDocument: 'none',
      formerParticipantRetentionMonths: 12,
      outlineLibraryMaxVisibility: 'clubs',
      applicationAgeReferenceDay: '09-01',
      applicationAnswerDays: 7,
      applicationInformation: null,
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
        coachMayCancel: false,
      }),
    ).toEqual({
      values: {
        ...CLUB_SETTINGS_DEFAULTS,
        ownAccountMinAge: 13,
        shortName: 'Dev Academy',
        coachMayCancel: false,
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
        coachMayCancel: 'no',
        orderSalesDocument: 'invoice',
      }),
    ).toEqual({
      values: { ...CLUB_SETTINGS_DEFAULTS, defaultLocale: 'en' },
      invalidKeys: [
        'ownAccountMinAge',
        'timezone',
        'currency',
        'declarationKinds',
        'coachMayCancel',
        'orderSalesDocument',
      ],
    })
  })

  it('validates a partial update field by field', () => {
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 14 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 0 }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 12 }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 13 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 18 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ ownAccountMinAge: 19 }).success).toBe(false)
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

  it('names the first business rule an update breaks (#87)', () => {
    expect(clubSettingsRuleProblem({})).toBeNull()
    expect(clubSettingsRuleProblem({ timezone: 'Europe/Warsaw', ownAccountMinAge: 13 })).toBeNull()
    expect(clubSettingsRuleProblem({ ownAccountMinAge: 18 })).toBeNull()
    expect(clubSettingsRuleProblem({ timezone: 'Mars/Olympus' })).toEqual({
      code: 'timezone_unknown',
      field: 'timezone',
    })
    expect(clubSettingsRuleProblem({ timezone: 'Mars/Olympus', ownAccountMinAge: 1 })).toEqual({
      code: 'timezone_unknown',
      field: 'timezone',
    })
    expect(clubSettingsRuleProblem({ ownAccountMinAge: 12 })).toEqual({
      code: 'account_age_threshold_out_of_range',
      field: 'ownAccountMinAge',
    })
    expect(clubSettingsRuleProblem({ ownAccountMinAge: 19 })).toEqual({
      code: 'account_age_threshold_out_of_range',
      field: 'ownAccountMinAge',
    })
  })

  it('keeps the former participants retention period within 1–120 months (REQ-041, #471)', () => {
    expect(clubSettingsRuleProblem({ formerParticipantRetentionMonths: 1 })).toBeNull()
    expect(clubSettingsRuleProblem({ formerParticipantRetentionMonths: 120 })).toBeNull()
    for (const months of [0, 121]) {
      expect(clubSettingsRuleProblem({ formerParticipantRetentionMonths: months })).toEqual({
        code: 'retention_months_out_of_range',
        field: 'formerParticipantRetentionMonths',
      })
    }
    expect(clubSettingsPatchSchema.safeParse({ formerParticipantRetentionMonths: 24 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ formerParticipantRetentionMonths: 0 }).success).toBe(false)
    expect(resolveClubSettings({ formerParticipantRetentionMonths: 500 })).toMatchObject({
      values: { formerParticipantRetentionMonths: 12 },
      invalidKeys: ['formerParticipantRetentionMonths'],
    })
  })

  it('takes the widest outline library level, `clubs` by default (B-O1, #685)', () => {
    expect(clubSettingsPatchSchema.safeParse({ outlineLibraryMaxVisibility: 'public' }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ outlineLibraryMaxVisibility: 'world' }).success).toBe(false)
    expect(resolveClubSettings({ outlineLibraryMaxVisibility: 'world' })).toMatchObject({
      values: { outlineLibraryMaxVisibility: 'clubs' },
      invalidKeys: ['outlineLibraryMaxVisibility'],
    })
  })

  it('lists the time zones sorted, keeping the stored one selectable', () => {
    expect(timeZoneOptions(['Europe/Warsaw', 'America/New_York'], 'Europe/Warsaw')).toEqual([
      'America/New_York',
      'Europe/Warsaw',
    ])
    expect(timeZoneOptions(['Europe/Warsaw'], 'UTC')).toEqual(['Europe/Warsaw', 'UTC'])
    expect(timeZoneOptions(['Europe/Warsaw'], null)).toEqual(['Europe/Warsaw'])
  })
})

describe('application settings (sign-up form spec REQ-J02)', () => {
  it('builds and reads a day of the year every year has', () => {
    expect(monthDayOf(9, 1)).toBe('09-01')
    expect(monthDayOf(12, 31)).toBe('12-31')
    expect(monthDayOf(2, 28)).toBe('02-28')
    expect(monthDayOf(2, 29)).toBeNull()
    expect(monthDayOf(4, 31)).toBeNull()
    expect(monthDayOf(13, 1)).toBeNull()
    expect(monthDayOf(0, 1)).toBeNull()
    expect(monthDayOf(1, 0)).toBeNull()
    expect(monthDayOf(1.5, 1)).toBeNull()
    expect(monthDayOf(1, 1.5)).toBeNull()
    expect(parseMonthDay('09-01')).toEqual({ month: 9, day: 1 })
    expect(parseMonthDay('02-29')).toBeNull()
    expect(parseMonthDay('9-1')).toBeNull()
    expect(isMonthDay('01-31')).toBe(true)
    expect(isMonthDay('06-31')).toBe(false)
  })

  it('validates the reference day, the answer time and the information text', () => {
    expect(APPLICATION_ANSWER_DAYS_RANGE).toEqual({ min: 1, max: 60 })
    expect(clubSettingsPatchSchema.safeParse({ applicationAgeReferenceDay: '08-15' }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ applicationAgeReferenceDay: '02-30' }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ applicationAnswerDays: 1 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ applicationAnswerDays: 60 }).success).toBe(true)
    expect(clubSettingsPatchSchema.safeParse({ applicationAnswerDays: 0 }).success).toBe(false)
    expect(clubSettingsPatchSchema.safeParse({ applicationAnswerDays: 61 }).success).toBe(false)
    expect(clubSettingsPatchSchema.parse({ applicationInformation: '  Hello  ' })).toEqual({
      applicationInformation: 'Hello',
    })
    expect(clubSettingsPatchSchema.parse({ applicationInformation: '   ' })).toEqual({ applicationInformation: null })
    expect(clubSettingsPatchSchema.parse({ applicationInformation: null })).toEqual({ applicationInformation: null })
    const tooLong = 'x'.repeat(APPLICATION_INFORMATION_MAX_LENGTH + 1)
    expect(clubSettingsPatchSchema.safeParse({ applicationInformation: tooLong }).success).toBe(false)
  })

  it('falls back to the defaults for invalid stored values', () => {
    expect(
      resolveClubSettings({
        applicationAgeReferenceDay: '13-01',
        applicationAnswerDays: 99,
        applicationInformation: 'Text',
      }),
    ).toMatchObject({
      values: { applicationAgeReferenceDay: '09-01', applicationAnswerDays: 7, applicationInformation: 'Text' },
      invalidKeys: ['applicationAgeReferenceDay', 'applicationAnswerDays'],
    })
  })
})
