// The rules of the shared outline library (training outlines spec phase 4, DD-O10…DD-O15, BR-O4…BR-O6, REQ-O11…REQ-O16;
// E24-S05, #685): the library's configuration, the visibility levels, the pseudonymous rater keys, the ranking, the
// author credit, the snapshot allow-list a publication copies out of a club, the report threshold and the search query.
// Framework-free: no database, no container (the HMAC comes from `node:crypto`).
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import {
  OUTLINE_LANGUAGES,
  OUTLINE_LIMITS,
  OUTLINE_PARTS,
  type OutlineContent,
  type OutlineImageRef,
  type OutlineLanguage,
  type OutlinePart,
  type OutlineParts,
} from './outline'

// ---------------------------------------------------------------------------------------------------------------------
// Visibility (REQ-O11, BR-O4, BR-O5, DD-O11)

/** The club setting's levels, narrowest first: `club` = never published, `clubs` = clubs on Vereino, `public`. */
export const LIBRARY_LEVELS = ['club', 'clubs', 'public'] as const
export type LibraryLevel = (typeof LIBRARY_LEVELS)[number]

/** The levels a publication may have: "club" means not published (DD-O11). */
export const PUBLISH_VISIBILITIES = ['clubs', 'public'] as const
export type PublishVisibility = (typeof PUBLISH_VISIBILITIES)[number]

/** A new club starts at "clubs on Vereino" (D-038 §4). */
export const DEFAULT_LIBRARY_LEVEL: LibraryLevel = 'clubs'

const rank = (level: LibraryLevel): number => LIBRARY_LEVELS.indexOf(level)

/** BR-O4: whether a publication at `visibility` fits under the club's widest level. */
export function visibilityAllowed(visibility: PublishVisibility, max: LibraryLevel): boolean {
  return rank(visibility) <= rank(max)
}

/** BR-O5: whether an entry at `visibility` must be withdrawn after the club's level became `max`. */
export function aboveLevel(visibility: string, max: LibraryLevel): boolean {
  return !(PUBLISH_VISIBILITIES as readonly string[]).includes(visibility)
    ? false
    : !visibilityAllowed(visibility as PublishVisibility, max)
}

/** A stored level read defensively: anything unknown is the default. */
export function readLevel(value: unknown): LibraryLevel {
  return (LIBRARY_LEVELS as readonly unknown[]).includes(value) ? (value as LibraryLevel) : DEFAULT_LIBRARY_LEVEL
}

/** The states of an entry: `listed`, hidden after reports from three clubs until an operator decides, or removed. */
export const ENTRY_STATUSES = ['listed', 'hidden_reported', 'removed'] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

/** The licence of every shared outline (Q-O03, decided 2026-11-24; the lawyer confirms it before the release). */
export const LIBRARY_LICENCE = 'CC-BY-SA-4.0'
export const LIBRARY_LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'

/** The version of the terms an author accepts before the first publication (`training_authors`). */
export const LIBRARY_TERMS_VERSION = '2026-11-25'

// ---------------------------------------------------------------------------------------------------------------------
// Configuration (DD-O10, DD-O12)

export type RaterSecret = { version: number; secret: string }

export type LibraryConfig = {
  tenantId: string
  organizationId: string
  /** Every rater secret, newest version first; the first one keys new rows (DD-O12). */
  raterSecrets: RaterSecret[]
}

/** The minimum length of a rater secret. */
export const RATER_SECRET_MIN_LENGTH = 32

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The rater secrets of `VEREINO_LIBRARY_RATER_SECRET`: one secret (version 1), or a comma-separated list of
 * `v<n>:<secret>` — a rotation adds a version and keeps the old ones, so a rater key made with an old secret stays
 * valid and nobody is re-keyed (DD-O12). Null when the value is missing, malformed, too short or names a version twice.
 */
export function parseRaterSecrets(value: string | undefined): RaterSecret[] | null {
  const raw = value?.trim()
  if (!raw) return null
  const parts = raw.split(',').map((part) => part.trim())
  const secrets: RaterSecret[] = []
  if (parts.length === 1 && !/^v\d+:/.test(parts[0])) {
    secrets.push({ version: 1, secret: parts[0] })
  } else {
    for (const part of parts) {
      const match = /^v(\d+):(.+)$/.exec(part)
      if (!match) return null
      secrets.push({ version: Number(match[1]), secret: match[2] })
    }
  }
  if (secrets.some((entry) => entry.version < 1 || entry.secret.length < RATER_SECRET_MIN_LENGTH)) return null
  if (new Set(secrets.map((entry) => entry.version)).size !== secrets.length) return null
  return secrets.sort((left, right) => right.version - left.version)
}

/**
 * The library's configuration from the environment (`VEREINO_LIBRARY_TENANT_ID`, `VEREINO_LIBRARY_ORGANIZATION_ID`,
 * `VEREINO_LIBRARY_RATER_SECRET`). Null — the library is off and its routes answer 404 `library_not_configured` — when
 * any of them is missing or malformed.
 */
export function readLibraryConfig(env: Record<string, string | undefined>): LibraryConfig | null {
  const tenantId = env.VEREINO_LIBRARY_TENANT_ID?.trim() ?? ''
  const organizationId = env.VEREINO_LIBRARY_ORGANIZATION_ID?.trim() ?? ''
  if (!UUID.test(tenantId) || !UUID.test(organizationId)) return null
  const raterSecrets = parseRaterSecrets(env.VEREINO_LIBRARY_RATER_SECRET)
  if (!raterSecrets) return null
  return { tenantId: tenantId.toLowerCase(), organizationId: organizationId.toLowerCase(), raterSecrets }
}

/** The ids of the library tenant from the environment alone (for `library-init`, which may run before the secret). */
export function configuredLibraryIds(env: Record<string, string | undefined>): {
  tenantId: string | null
  organizationId: string | null
} {
  const pick = (value: string | undefined) => {
    const trimmed = value?.trim() ?? ''
    return UUID.test(trimmed) ? trimmed.toLowerCase() : null
  }
  return { tenantId: pick(env.VEREINO_LIBRARY_TENANT_ID), organizationId: pick(env.VEREINO_LIBRARY_ORGANIZATION_ID) }
}

// ---------------------------------------------------------------------------------------------------------------------
// Rater keys (DD-O12)

export type RaterKey = { key: string; version: number }

/** `HMAC(secret, club organization id ‖ person id)`, hex: pseudonymous, never another tenant's person id. */
export function raterKey(secret: RaterSecret, organizationId: string, personId: string): RaterKey {
  const key = createHmac('sha256', secret.secret)
    .update(`${organizationId.toLowerCase()}|${personId.toLowerCase()}`)
    .digest('hex')
  return { key, version: secret.version }
}

/** The person's key under the newest secret: the one new rows carry. */
export function currentRaterKey(config: Pick<LibraryConfig, 'raterSecrets'>, organizationId: string, personId: string) {
  return raterKey(config.raterSecrets[0], organizationId, personId)
}

/** The person's keys under every secret version: a lookup or an erasure matches rows of any version. */
export function allRaterKeys(
  config: Pick<LibraryConfig, 'raterSecrets'>,
  organizationId: string,
  personId: string,
): string[] {
  return config.raterSecrets.map((secret) => raterKey(secret, organizationId, personId).key)
}

/** A public report's key: the client's address, hashed (never stored in clear), under the newest secret. */
export function publicReporterKey(config: Pick<LibraryConfig, 'raterSecrets'>, address: string): RaterKey {
  const secret = config.raterSecrets[0]
  return {
    key: createHmac('sha256', secret.secret).update(`ip|${address.trim().toLowerCase()}`).digest('hex'),
    version: secret.version,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ranking (DD-O13)

/** The weight of the prior in the Bayesian average: an entry behaves as if it had this many ratings of the mean. */
export const RANKING_PRIOR_WEIGHT = 5

/** The mean rating over every listed entry (`m`); 0 while nothing is rated. */
export function meanRating(totals: { ratingSum: number; ratingCount: number }): number {
  return totals.ratingCount > 0 ? totals.ratingSum / totals.ratingCount : 0
}

/** `(5 × m + Σ ratings) ÷ (5 + n)`: one 5 does not beat forty 4.6s. */
export function bayesianScore(entry: { ratingSum: number; ratingCount: number }, mean: number): number {
  return (RANKING_PRIOR_WEIGHT * mean + entry.ratingSum) / (RANKING_PRIOR_WEIGHT + entry.ratingCount)
}

/** The plain average shown on a card, one decimal; null without ratings. */
export function averageRating(entry: { ratingSum: number; ratingCount: number }): number | null {
  return entry.ratingCount > 0 ? Math.round((entry.ratingSum / entry.ratingCount) * 10) / 10 : null
}

export const LIBRARY_SORTS = ['ranking', 'used', 'newest'] as const
export type LibrarySort = (typeof LIBRARY_SORTS)[number]

type Rankable = { id: string; ratingSum: number; ratingCount: number; userCount: number; publishedAt: Date }

/** Orders entries by the chosen sort; ties by distinct users, then newest, then id (a stable order). */
export function compareEntries(sort: LibrarySort, mean: number) {
  return (left: Rankable, right: Rankable): number => {
    if (sort === 'ranking') {
      const delta = bayesianScore(right, mean) - bayesianScore(left, mean)
      if (delta !== 0) return delta
    }
    if (sort !== 'newest' && right.userCount !== left.userCount) return right.userCount - left.userCount
    const time = right.publishedAt.getTime() - left.publishedAt.getTime()
    if (time !== 0) return time
    return left.id.localeCompare(right.id)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Author credit (REQ-O14, glossary *Author credit*)

export type CreditOrigin = { entryId: string | null; clubName: string; authorName: string | null }

export type LibraryCredit = {
  clubName: string
  /** "First L." only with the author's name consent at publish time; null otherwise or after it was withdrawn. */
  authorName: string | null
  /** The first author a copy was adapted from: "adapted by" this club. */
  adaptedFrom: CreditOrigin | null
}

const originSchema = z.object({
  entryId: z.string().nullable().catch(null),
  clubName: z.string(),
  authorName: z.string().nullable().catch(null),
})

const creditSchema = z.object({
  clubName: z.string(),
  authorName: z.string().nullable().catch(null),
  adaptedFrom: originSchema.nullable().catch(null),
})

/** A stored credit read defensively; null when it is not one. */
export function readCredit(value: unknown): LibraryCredit | null {
  const parsed = creditSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    clubName: parsed.data.clubName,
    authorName: parsed.data.authorName ?? null,
    adaptedFrom: parsed.data.adaptedFrom
      ? {
          entryId: parsed.data.adaptedFrom.entryId ?? null,
          clubName: parsed.data.adaptedFrom.clubName,
          authorName: parsed.data.adaptedFrom.authorName ?? null,
        }
      : null,
  }
}

/**
 * The credit a club outline keeps when copied from entry `entryId` (`training_outlines.origin_credit`): the entry's
 * first author — its own `adaptedFrom` when the entry is itself a copy, else its club and author.
 */
export function originOf(entryId: string, credit: LibraryCredit): CreditOrigin {
  if (credit.adaptedFrom) return { ...credit.adaptedFrom }
  return { entryId, clubName: credit.clubName, authorName: credit.authorName }
}

/** A stored origin read defensively (`training_outlines.origin_credit`). */
export function readOrigin(value: unknown): CreditOrigin | null {
  const parsed = originSchema.safeParse(value)
  return parsed.success
    ? {
        entryId: parsed.data.entryId ?? null,
        clubName: parsed.data.clubName,
        authorName: parsed.data.authorName ?? null,
      }
    : null
}

/** The credit of a publication: the club always, the author's public name only with consent, the origin kept. */
export function buildCredit(input: {
  clubName: string
  authorName: string | null
  origin: CreditOrigin | null
}): LibraryCredit {
  return { clubName: input.clubName, authorName: input.authorName, adaptedFrom: input.origin }
}

/** The credit without the author's name; `adaptedFromEntryIds` also strips the origin's name when it is one of them. */
export function withoutAuthorName(
  credit: LibraryCredit,
  options: { own: boolean; adaptedFromEntryIds?: ReadonlySet<string> },
): LibraryCredit {
  const origin = credit.adaptedFrom
  const stripOrigin = Boolean(origin?.entryId && options.adaptedFromEntryIds?.has(origin.entryId))
  return {
    clubName: credit.clubName,
    authorName: options.own ? null : credit.authorName,
    adaptedFrom: origin && stripOrigin ? { ...origin, authorName: null } : origin,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The snapshot a publication copies (DD-O11: an allow-list; no session, group or person ids)

export type LibraryExercise = {
  name: string
  minutes: number
  organisation: string
  coachingPoints: string
  /** Index into the entry's `images` (library-tenant attachments), or null. */
  image: number | null
}

export type LibraryParts = Record<OutlinePart, LibraryExercise[]>

export type LibrarySnapshot = {
  language: OutlineLanguage
  topic: string
  goal: string
  specificGoals: string
  ageCategory: string
  durationMinutes: number
  playersCount: number | null
  equipment: string
  parts: LibraryParts
}

const libraryExerciseSchema = z
  .object({
    name: z.string(),
    minutes: z.number().int(),
    organisation: z.string(),
    coachingPoints: z.string(),
    image: z
      .number()
      .int()
      .min(0)
      .max(OUTLINE_LIMITS.images - 1)
      .nullable(),
  })
  .strict()

export const libraryPartsSchema = z
  .object({
    warm_up: z.array(libraryExerciseSchema),
    main: z.array(libraryExerciseSchema),
    cool_down: z.array(libraryExerciseSchema),
  })
  .strict()

/** Stored library parts read defensively: anything that is not valid becomes three empty parts. */
export function readLibraryParts(value: unknown): LibraryParts {
  const parsed = libraryPartsSchema.safeParse(value)
  return parsed.success ? parsed.data : { warm_up: [], main: [], cool_down: [] }
}

/**
 * The publication's snapshot of an outline: only the content fields, each exercise's image replaced by its position
 * among `images` (the outline's images in part order, which the publication copies into the library tenant).
 */
export function librarySnapshot(content: OutlineContent, images: readonly OutlineImageRef[]): LibrarySnapshot {
  const index = new Map(images.map((image, position) => [image.attachmentId, position]))
  const parts = {} as LibraryParts
  for (const part of OUTLINE_PARTS) {
    parts[part] = content.parts[part].map((exercise) => ({
      name: exercise.name,
      minutes: exercise.minutes,
      organisation: exercise.organisation,
      coachingPoints: exercise.coachingPoints,
      image: exercise.image ? (index.get(exercise.image.attachmentId) ?? null) : null,
    }))
  }
  return {
    language: content.language,
    topic: content.topic,
    goal: content.goal,
    specificGoals: content.specificGoals,
    ageCategory: content.ageCategory,
    durationMinutes: content.durationMinutes,
    playersCount: content.playersCount ?? null,
    equipment: content.equipment,
    parts,
  }
}

/**
 * The club outline's parts made from an entry's parts (a copy, REQ-O12): each image index replaced by the club image
 * `imageAt` returns for it (the copy's own attachment), or none when it could not be copied.
 */
export function clubPartsOf(parts: LibraryParts, imageAt: (index: number) => OutlineImageRef | null): OutlineParts {
  const result = {} as OutlineParts
  for (const part of OUTLINE_PARTS) {
    result[part] = parts[part].map((exercise) => ({
      name: exercise.name,
      minutes: exercise.minutes,
      organisation: exercise.organisation,
      coachingPoints: exercise.coachingPoints,
      image: exercise.image === null ? null : imageAt(exercise.image),
    }))
  }
  return result
}

/** The parts an entry's text search matches: which parts have at least one exercise (the `part` filter). */
export function partsWithExercises(parts: LibraryParts): OutlinePart[] {
  return OUTLINE_PARTS.filter((part) => parts[part].length > 0)
}

// ---------------------------------------------------------------------------------------------------------------------
// Reports (REQ-O15, DD-O14, Q-O04)

export const REPORT_REASONS = ['copyright', 'wrong_content', 'offensive', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_NOTE_MAX = 500

/** Reports from this many different clubs hide an entry until an operator decides. */
export const REPORT_HIDE_CLUBS = 3

/** Whether a listed entry is hidden now: reported by `distinctClubs` clubs. */
export function hiddenByReports(status: EntryStatus, distinctClubs: number): boolean {
  return status === 'listed' && distinctClubs >= REPORT_HIDE_CLUBS
}

/** The operator's decisions (`library-moderate`). */
export const MODERATION_ACTIONS = ['list', 'restore', 'remove'] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

// ---------------------------------------------------------------------------------------------------------------------
// Search (M-O8)

export const librarySearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(200).optional(),
  ageCategory: z.string().trim().max(OUTLINE_LIMITS.ageCategory).optional(),
  part: z.enum(OUTLINE_PARTS).optional(),
  sort: z.enum(LIBRARY_SORTS).default('ranking'),
})
export type LibrarySearch = z.infer<typeof librarySearchSchema>

/** `value` for a SQL `ILIKE … escape '\'` pattern: `%`, `_` and `\` match themselves. */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

export const STARS = { min: 1, max: 5 } as const

/** The languages an entry may carry (the outline's). */
export const ENTRY_LANGUAGES = OUTLINE_LANGUAGES
