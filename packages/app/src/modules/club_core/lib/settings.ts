// Club settings with Zod-typed defaults (foundation spec DD-F16, club spec DD-37, D-022). Pure: the stored row is
// passed in, and an invalid stored value falls back to its default and is named in `invalidKeys`, so the service
// can report it (`club_core.settings.invalid`) without failing the read.
import { z } from 'zod'

/** True when `value` is an IANA time zone this runtime knows (e.g. `Europe/Warsaw`). */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const BCP47_LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/

/** One schema per setting, so a single invalid stored value does not discard the others. */
export const clubSettingFieldSchemas = {
  /** Minimum age in completed years for an own account (D-022; 1–18). */
  ownAccountMinAge: z.number().int().min(1).max(18),
  /** BCP 47 language tag of the club's default locale. */
  defaultLocale: z.string().regex(BCP47_LANGUAGE_PATTERN),
  /** IANA time zone the club's calendar dates are computed in. */
  timezone: z.string().refine(isTimeZone, { message: 'Expected an IANA time zone' }),
} as const

export const clubSettingsSchema = z.object(clubSettingFieldSchemas)

/** A partial update: every field optional, each validated with its own schema. */
export const clubSettingsPatchSchema = clubSettingsSchema.partial()

export type ClubSettingsValues = z.output<typeof clubSettingsSchema>

export type ClubSettingKey = keyof ClubSettingsValues

export const CLUB_SETTINGS_DEFAULTS: Readonly<ClubSettingsValues> = {
  ownAccountMinAge: 16,
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
}

const CLUB_SETTING_KEYS = Object.keys(clubSettingFieldSchemas) as ClubSettingKey[]

export type ResolvedClubSettings = {
  values: ClubSettingsValues
  /** Stored values that failed validation and were replaced by their default. */
  invalidKeys: ClubSettingKey[]
}

/**
 * The effective settings for a stored row (or `null` when the club has none yet): a missing value takes its
 * default silently; an invalid one takes its default and is listed in `invalidKeys`.
 */
export function resolveClubSettings(stored: Partial<Record<ClubSettingKey, unknown>> | null): ResolvedClubSettings {
  const values: Record<string, unknown> = {}
  const invalidKeys: ClubSettingKey[] = []
  for (const key of CLUB_SETTING_KEYS) {
    const raw = stored?.[key]
    if (raw === undefined || raw === null) {
      values[key] = CLUB_SETTINGS_DEFAULTS[key]
      continue
    }
    const parsed = clubSettingFieldSchemas[key].safeParse(raw)
    if (parsed.success) {
      values[key] = parsed.data
    } else {
      values[key] = CLUB_SETTINGS_DEFAULTS[key]
      invalidKeys.push(key)
    }
  }
  return { values: values as ClubSettingsValues, invalidKeys }
}
