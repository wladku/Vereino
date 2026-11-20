// The club's age category dictionary of `team` groups (club spec REQ-019, phase 2 step 1, #92): a dictionary of the
// platform `dictionaries` module, keyed `groups.age_categories` per organization, seeded with the PZPN defaults and
// edited by the club administrator on the platform dictionaries page. `groups` stores only the entry id
// (`age_category_entry_id`, scalar, no cross-module relation) and reads the entries here, always within the trusted
// tenant and organization. Entries are hard-deleted by the platform; a group whose entry was removed shows no category.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Dictionary, DictionaryEntry } from '@open-mercato/core/modules/dictionaries/data/entities'
import {
  resolveDictionaryEntrySortMode,
  sortDictionaryEntries,
} from '@open-mercato/core/modules/dictionaries/lib/entrySort'
import { normalizeDictionaryValue } from '@open-mercato/core/modules/dictionaries/lib/utils'
import type { CalendarDate } from '@vereino/core'
import { AgeCategoryRange, Season } from '../data/entities'
import {
  AGE_CATEGORY_DICTIONARY_KEY,
  PZPN_AGE_CATEGORIES,
  birthYearsOf,
  referenceYear,
  type BirthYears,
} from '../lib/groups-rules'
import type { GroupsScope } from './directory'

export type AgeCategoryOption = { id: string; value: string; label: string }

/** The club's age category dictionary (live), read in the caller's EntityManager. */
export function findAgeCategoryDictionary(em: EntityManager, scope: GroupsScope): Promise<Dictionary | null> {
  return em.findOne(Dictionary, { ...scope, key: AGE_CATEGORY_DICTIONARY_KEY, deletedAt: null })
}

const findDictionary = findAgeCategoryDictionary

/** The entries of the club's age category dictionary in the dictionary's own sort order (empty without one). */
export async function listAgeCategories(container: AwilixContainer, scope: GroupsScope): Promise<AgeCategoryOption[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const dictionary = await findDictionary(em, scope)
  if (!dictionary || !dictionary.isActive) return []
  const entries = await em.find(DictionaryEntry, { ...scope, dictionary })
  return sortDictionaryEntries(entries, resolveDictionaryEntrySortMode(dictionary.entrySortMode)).map((entry) => ({
    id: entry.id,
    value: entry.value,
    label: entry.label,
  }))
}

/**
 * Whether `entryId` is an entry of the club's active age category dictionary — what the picker offers — read in the
 * caller's transaction.
 */
export async function isAgeCategoryEntry(em: EntityManager, scope: GroupsScope, entryId: string): Promise<boolean> {
  const dictionary = await findDictionary(em, scope)
  if (!dictionary || !dictionary.isActive) return false
  const entry = await em.findOne(DictionaryEntry, { id: entryId, ...scope, dictionary }, { fields: ['id'] })
  return entry !== null
}

/** Age category labels by entry id, for the groups a list or a detail already authorized. */
export async function ageCategoryNames(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const em = container.resolve<EntityManager>('em').fork()
  const dictionary = await findDictionary(em, scope)
  if (!dictionary) return new Map()
  const entries = await em.find(
    DictionaryEntry,
    { id: { $in: unique }, ...scope, dictionary },
    { fields: ['id', 'label'] },
  )
  return new Map(entries.map((entry) => [entry.id, entry.label]))
}

/**
 * Creates the club's age category dictionary with the PZPN defaults (`seedDefaults`, idempotent): a club that already
 * has the dictionary keeps it as its administrator left it, so a re-run never brings back a removed entry. The
 * dictionary is a system one (the platform refuses to delete it) and keeps the seeded order (`created_at_asc`).
 * Returns whether it created the dictionary.
 */
export async function seedAgeCategoryDictionary(container: AwilixContainer, scope: GroupsScope): Promise<boolean> {
  const em = container.resolve<EntityManager>('em').fork()
  if (await findDictionary(em, scope)) return false
  const now = Date.now()
  const dictionary = em.create(Dictionary, {
    ...scope,
    key: AGE_CATEGORY_DICTIONARY_KEY,
    name: 'PZPN age categories',
    description: 'Age categories of football teams (groups of kind team).',
    isSystem: true,
    isActive: true,
    managerVisibility: 'default',
    entrySortMode: 'created_at_asc',
    createdAt: new Date(now),
    updatedAt: new Date(now),
  })
  em.persist(dictionary)
  PZPN_AGE_CATEGORIES.forEach((category, position) => {
    // One millisecond apart, so `created_at_asc` keeps the PZPN order (youngest first).
    const createdAt = new Date(now + position)
    // The id is set here, not by the database default, so the range can name its entry before the flush.
    const entry = em.create(DictionaryEntry, {
      id: randomUUID(),
      ...scope,
      dictionary,
      value: category.value,
      normalizedValue: normalizeDictionaryValue(category.value),
      label: category.label,
      color: null,
      icon: null,
      position,
      isDefault: false,
      createdAt,
      updatedAt: createdAt,
    })
    em.persist(entry)
    // Each seeded category starts with its PZPN "U" range (REQ-L16, #384).
    em.persist(
      em.create(AgeCategoryRange, {
        ...scope,
        entryId: entry.id,
        uFrom: category.range.uFrom,
        uTo: category.range.uTo,
        createdAt,
        updatedAt: createdAt,
      }),
    )
  })
  await em.flush()
  return true
}

/** The live ranges of the given entries, by entry id, read in the caller's EntityManager. */
export async function rangesByEntry(
  em: EntityManager,
  scope: GroupsScope,
  entryIds: readonly string[],
): Promise<Map<string, AgeCategoryRange>> {
  if (entryIds.length === 0) return new Map()
  const rows = await em.find(AgeCategoryRange, { ...scope, entryId: { $in: [...entryIds] }, deletedAt: null })
  return new Map(rows.map((row) => [row.entryId, row]))
}

/** The season of `seasonId`, or else the live season that contains `today` (the latest start when several do). */
export async function seasonForReference(
  em: EntityManager,
  scope: GroupsScope,
  seasonId: string | null,
  today: CalendarDate,
): Promise<Season | null> {
  if (seasonId) return em.findOne(Season, { id: seasonId, ...scope, deletedAt: null })
  const found = await em.find(
    Season,
    { ...scope, deletedAt: null, startsOn: { $lte: today }, endsOn: { $gte: today } },
    { orderBy: { startsOn: 'desc' }, limit: 1 },
  )
  return found.at(0) ?? null
}

export type AgeCategoryWithRange = AgeCategoryOption & {
  uFrom: number | null
  uTo: number | null
  birthYears: BirthYears | null
  updatedAt: string | null
}

export type AgeCategoryRangeList = {
  items: AgeCategoryWithRange[]
  referenceYear: number
  season: { id: string; name: string; startsOn: string } | null
}

/**
 * The club's categories in the dictionary's order with their "U" ranges and the birth years in the reference year of
 * `seasonId` — or of the season of `today`, or `today`'s year without one (Q-L25). An unknown `seasonId` answers null.
 */
export async function listAgeCategoryRanges(
  container: AwilixContainer,
  scope: GroupsScope,
  seasonId: string | null,
  today: CalendarDate,
): Promise<AgeCategoryRangeList | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const season = await seasonForReference(em, scope, seasonId, today)
  if (seasonId && !season) return null
  const year = referenceYear(season?.startsOn ?? null, today)
  const categories = await listAgeCategories(container, scope)
  const ranges = await rangesByEntry(
    em,
    scope,
    categories.map((category) => category.id),
  )
  return {
    referenceYear: year,
    season: season ? { id: season.id, name: season.name, startsOn: season.startsOn } : null,
    items: categories.map((category) => {
      const range = ranges.get(category.id)
      if (!range) return { ...category, uFrom: null, uTo: null, birthYears: null, updatedAt: null }
      const bounds = { uFrom: range.uFrom, uTo: range.uTo ?? null }
      return {
        ...category,
        ...bounds,
        birthYears: birthYearsOf(bounds, year),
        updatedAt: range.updatedAt.toISOString(),
      }
    }),
  }
}
