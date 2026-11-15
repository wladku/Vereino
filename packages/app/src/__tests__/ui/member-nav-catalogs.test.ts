// TEST-N11 of the navigation spec (#258): the five member frames read the shell labels of `@vereino/ui` from their own
// catalog prefix, so the bar must read the same in every module. Every key of `MEMBER_SHELL_LABEL_KEYS` exists under
// each of the five prefixes, in pl and en, with the same value.
import { describe, expect, it } from '@jest/globals'
import { MEMBER_SHELL_LABEL_KEYS } from '@vereino/ui'
import activitiesEn from '../../modules/activities/i18n/en.json'
import activitiesPl from '../../modules/activities/i18n/pl.json'
import communicationEn from '../../modules/communication/i18n/en.json'
import communicationPl from '../../modules/communication/i18n/pl.json'
import facilitiesEn from '../../modules/facilities/i18n/en.json'
import facilitiesPl from '../../modules/facilities/i18n/pl.json'
import paymentsEn from '../../modules/payments/i18n/en.json'
import paymentsPl from '../../modules/payments/i18n/pl.json'
import peopleEn from '../../modules/people/i18n/en.json'
import peoplePl from '../../modules/people/i18n/pl.json'

type Catalog = Record<string, string>

const FRAMES: { prefix: string; catalogs: Record<'pl' | 'en', Catalog> }[] = [
  { prefix: 'people.club.nav', catalogs: { pl: peoplePl, en: peopleEn } },
  { prefix: 'activities.club.nav', catalogs: { pl: activitiesPl, en: activitiesEn } },
  { prefix: 'communication.club.nav', catalogs: { pl: communicationPl, en: communicationEn } },
  { prefix: 'payments.club.nav', catalogs: { pl: paymentsPl, en: paymentsEn } },
  { prefix: 'facilities.places.nav', catalogs: { pl: facilitiesPl, en: facilitiesEn } },
]

describe.each(['pl', 'en'] as const)('member nav labels in %s', (locale) => {
  it.each(MEMBER_SHELL_LABEL_KEYS.map((key) => [key]))('%s reads the same in the five module catalogs', (key) => {
    const catalogKey = key === 'nav' ? 'label' : key
    const values = FRAMES.map(({ prefix, catalogs }) => [prefix, catalogs[locale][`${prefix}.${catalogKey}`]])
    for (const [prefix, value] of values) expect([prefix, typeof value]).toEqual([prefix, 'string'])
    expect(new Set(values.map(([, value]) => value)).size).toBe(1)
  })
})
