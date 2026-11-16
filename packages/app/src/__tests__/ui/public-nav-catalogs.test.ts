// TEST-N09 support (navigation spec REQ-N09, #261): the three public frames read the labels of `PublicHeader` from their
// own catalog prefix (S4.3 keeps them apart), so the header must read the same on every public page. Every key of
// `PUBLIC_HEADER_LABEL_KEYS` exists under each of the three prefixes, in pl and en, with the same value.
import { describe, expect, it } from '@jest/globals'
import { PUBLIC_HEADER_LABEL_KEYS } from '@vereino/ui'
import activitiesEn from '../../modules/activities/i18n/en.json'
import activitiesPl from '../../modules/activities/i18n/pl.json'
import clubCoreEn from '../../modules/club_core/i18n/en.json'
import clubCorePl from '../../modules/club_core/i18n/pl.json'
import facilitiesEn from '../../modules/facilities/i18n/en.json'
import facilitiesPl from '../../modules/facilities/i18n/pl.json'

type Catalog = Record<string, string>

const FRAMES: { prefix: string; catalogs: Record<'pl' | 'en', Catalog> }[] = [
  { prefix: 'club_core.public.nav', catalogs: { pl: clubCorePl, en: clubCoreEn } },
  { prefix: 'facilities.public.nav', catalogs: { pl: facilitiesPl, en: facilitiesEn } },
  { prefix: 'activities.publicSession.nav', catalogs: { pl: activitiesPl, en: activitiesEn } },
]

describe.each(['pl', 'en'] as const)('public header labels in %s', (locale) => {
  it.each(PUBLIC_HEADER_LABEL_KEYS.map((key) => [key]))('%s reads the same in the three module catalogs', (key) => {
    const catalogKey = key === 'nav' ? 'label' : key
    const values = FRAMES.map(({ prefix, catalogs }) => [prefix, catalogs[locale][`${prefix}.${catalogKey}`]])
    for (const [prefix, value] of values) expect([prefix, typeof value]).toEqual([prefix, 'string'])
    expect(new Set(values.map(([, value]) => value)).size).toBe(1)
  })
})
