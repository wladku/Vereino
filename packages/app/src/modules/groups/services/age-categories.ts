// The club's age category dictionary of `team` groups (club spec REQ-019, phase 2 step 1, #92): a dictionary of the
// platform `dictionaries` module, keyed `groups.age_categories` per organization, seeded with the PZPN defaults and
// edited by the club administrator on the platform dictionaries page. `groups` stores only the entry id
// (`age_category_entry_id`, scalar, no cross-module relation) and reads the entries here, always within the trusted
// tenant and organization. Entries are hard-deleted by the platform; a group whose entry was removed shows no category.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Dictionary, DictionaryEntry } from '@open-mercato/core/modules/dictionaries/data/entities'
import {
  resolveDictionaryEntrySortMode,
  sortDictionaryEntries,
} from '@open-mercato/core/modules/dictionaries/lib/entrySort'
import { normalizeDictionaryValue } from '@open-mercato/core/modules/dictionaries/lib/utils'
import { AGE_CATEGORY_DICTIONARY_KEY, PZPN_AGE_CATEGORIES } from '../lib/groups-rules'
import type { GroupsScope } from './directory'

export type AgeCategoryOption = { id: string; value: string; label: string }

function findDictionary(em: EntityManager, scope: GroupsScope): Promise<Dictionary | null> {
  return em.findOne(Dictionary, { ...scope, key: AGE_CATEGORY_DICTIONARY_KEY, deletedAt: null })
}

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
    em.persist(
      em.create(DictionaryEntry, {
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
      }),
    )
  })
  await em.flush()
  return true
}
