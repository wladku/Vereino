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
const CURRENCY_PATTERN = /^[A-Z]{3}$/

/** Activity types a club sets the declaration kind for (club spec glossary *Activity*; D-026). */
export const ACTIVITY_TYPES = ['training', 'match', 'sparring', 'tournament', 'camp', 'other'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** What a participant declares: only an absence, or a confirmation of attendance (R11). */
export const DECLARATION_KINDS = ['absence_only', 'confirm'] as const
export type DeclarationKind = (typeof DECLARATION_KINDS)[number]
export type DeclarationKinds = Record<ActivityType, DeclarationKind>

/** Who pays the online payment commission (R13). */
export const ONLINE_FEE_MODES = ['club_pays', 'payer_pays'] as const
/** How coaches are settled (R14); a stored setting only until the settlement work (A05). */
export const COACH_SETTLEMENT_MODELS = ['units_per_contract', 'fixed_base_adjusted'] as const
/** Whether guardians see the other called-up children (R15). */
export const CALLED_UP_CHILDREN_VISIBILITY = ['none', 'consented'] as const
/** The sales document of an order (R16); version 1.0 offers only `none`. */
export const ORDER_SALES_DOCUMENTS = ['none', 'receipt', 'invoice'] as const
export type OrderSalesDocument = (typeof ORDER_SALES_DOCUMENTS)[number]
export const AVAILABLE_ORDER_SALES_DOCUMENTS: readonly OrderSalesDocument[] = ['none']

/** True for a sales document this version offers. */
export function isAvailableSalesDocument(value: OrderSalesDocument): boolean {
  return AVAILABLE_ORDER_SALES_DOCUMENTS.includes(value)
}

/** True when `value` has at most two decimal places (a percentage such as `1.39`). */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
}

export const DEFAULT_DECLARATION_KINDS: Readonly<DeclarationKinds> = {
  training: 'absence_only',
  match: 'confirm',
  sparring: 'confirm',
  tournament: 'confirm',
  camp: 'confirm',
  other: 'confirm',
}

const declarationKindSchema = z.enum(DECLARATION_KINDS)

/** Any subset of the activity types; unknown types are rejected. */
export const declarationKindsPatchSchema = z
  .object({
    training: declarationKindSchema,
    match: declarationKindSchema,
    sparring: declarationKindSchema,
    tournament: declarationKindSchema,
    camp: declarationKindSchema,
    other: declarationKindSchema,
  })
  .partial()
  .strict()

/** The kinds per activity type: `base` overridden by the types `patch` names. */
export function mergeDeclarationKinds(
  base: Readonly<DeclarationKinds>,
  patch: Partial<DeclarationKinds> | undefined,
): DeclarationKinds {
  return { ...base, ...patch }
}

/** One schema per setting, so a single invalid stored value does not discard the others. */
export const clubSettingFieldSchemas = {
  /** Minimum age in completed years for an own account (D-022; 1–18). */
  ownAccountMinAge: z.number().int().min(1).max(18),
  /** BCP 47 language tag of the club's default locale. */
  defaultLocale: z.string().regex(BCP47_LANGUAGE_PATTERN),
  /** IANA time zone the club's calendar dates are computed in. */
  timezone: z.string().refine(isTimeZone, { message: 'Expected an IANA time zone' }),
  /** The club's short name; null clears it. */
  shortName: z.string().trim().min(1).max(100).nullable(),
  /** ISO 4217 code of the club currency. */
  currency: z.string().regex(CURRENCY_PATTERN),
  /** Declaration kind per activity type (D-026); a stored subset is completed with the defaults. */
  declarationKinds: declarationKindsPatchSchema.transform((stored) =>
    mergeDeclarationKinds(DEFAULT_DECLARATION_KINDS, stored),
  ),
  onlineFeeMode: z.enum(ONLINE_FEE_MODES),
  /** Percentage of the paid amount (0–100, two decimals). */
  onlineFeePercent: z.number().min(0).max(100).refine(hasAtMostTwoDecimals, { message: 'At most two decimals' }),
  /** Fixed part of the commission in minor units (grosz). */
  onlineFeeFixed: z.number().int().min(0).max(1_000_000),
  coachSettlementModel: z.enum(COACH_SETTLEMENT_MODELS),
  showCalledUpChildren: z.enum(CALLED_UP_CHILDREN_VISIBILITY),
  orderSalesDocument: z
    .enum(ORDER_SALES_DOCUMENTS)
    .refine(isAvailableSalesDocument, { message: 'This sales document is not available in this version' }),
} as const

export const clubSettingsSchema = z.object(clubSettingFieldSchemas)

/**
 * A partial update: every field optional, each validated with its own schema; `declarationKinds` takes any subset
 * of the activity types, merged into the current kinds by `applyClubSettingsPatch`.
 */
export const clubSettingsPatchSchema = z
  .object({ ...clubSettingFieldSchemas, declarationKinds: declarationKindsPatchSchema })
  .partial()

export type ClubSettingsValues = z.output<typeof clubSettingsSchema>

export type ClubSettingsPatch = z.output<typeof clubSettingsPatchSchema>

export type ClubSettingKey = keyof ClubSettingsValues

export const CLUB_SETTINGS_DEFAULTS: Readonly<ClubSettingsValues> = {
  ownAccountMinAge: 16,
  defaultLocale: 'pl',
  timezone: 'Europe/Warsaw',
  shortName: null,
  currency: 'PLN',
  declarationKinds: DEFAULT_DECLARATION_KINDS,
  onlineFeeMode: 'club_pays',
  onlineFeePercent: 0,
  onlineFeeFixed: 0,
  coachSettlementModel: 'units_per_contract',
  showCalledUpChildren: 'none',
  orderSalesDocument: 'none',
}

export const CLUB_SETTING_KEYS = Object.keys(clubSettingFieldSchemas) as ClubSettingKey[]

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

/** The settings after a partial update: absent keys keep their value; `declarationKinds` merges per type. */
export function applyClubSettingsPatch(current: ClubSettingsValues, patch: ClubSettingsPatch): ClubSettingsValues {
  const next: Record<string, unknown> = { ...current }
  for (const key of CLUB_SETTING_KEYS) {
    if (key === 'declarationKinds' || patch[key] === undefined) continue
    next[key] = patch[key]
  }
  next.declarationKinds = mergeDeclarationKinds(current.declarationKinds, patch.declarationKinds)
  return next as ClubSettingsValues
}

/** A stored decimal column (the driver returns a string) as a number; any other value is passed through. */
export function storedNumber(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : value
}
