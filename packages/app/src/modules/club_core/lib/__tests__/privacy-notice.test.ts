import { describe, expect, it } from '@jest/globals'
import en from '../../i18n/en.json'
import pl from '../../i18n/pl.json'
import {
  PRIVACY_NOTICE_CHILDREN,
  PRIVACY_NOTICE_PAGE_KEYS,
  PRIVACY_NOTICE_SECTIONS,
  privacyNoticeKeys,
  privacySectionKeys,
} from '../privacy-notice'

const catalogs: Record<string, Record<string, string>> = { en, pl }
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the default privacy notice (E19-S03, #469)', () => {
  it('numbers the keys of a section: heading, lead paragraphs, list items, closing notes', () => {
    expect(privacySectionKeys({ id: 'rights', lead: 1, items: 2, notes: 1 })).toEqual({
      title: 'club_core.privacy.rights.title',
      lead: ['club_core.privacy.rights.lead1'],
      items: ['club_core.privacy.rights.item1', 'club_core.privacy.rights.item2'],
      notes: ['club_core.privacy.rights.note1'],
    })
    expect(privacySectionKeys({ id: 'cookies', lead: 1, items: 0, notes: 0 })).toMatchObject({ items: [], notes: [] })
  })

  it('covers what S9.7 asks for and ends with the short version for children', () => {
    expect(PRIVACY_NOTICE_SECTIONS.map((section) => section.id)).toEqual([
      'controller',
      'data',
      'purposes',
      'children',
      'recipients',
      'retention',
      'rights',
      'cookies',
      'changes',
    ])
    expect(PRIVACY_NOTICE_CHILDREN.id).toBe('kids')
    for (const section of [...PRIVACY_NOTICE_SECTIONS, PRIVACY_NOTICE_CHILDREN]) {
      expect(section.lead + section.items + section.notes).toBeGreaterThan(0)
    }
  })

  it('lists every key once, the page keys first', () => {
    const keys = privacyNoticeKeys()
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.slice(0, 6)).toEqual(Object.values(PRIVACY_NOTICE_PAGE_KEYS))
    expect(keys).toContain('club_core.privacy.kids.item6')
  })

  it.each(Object.keys(catalogs))('the %s catalog holds every key, with the same placeholders as English', (locale) => {
    const catalog = catalogs[locale]
    for (const key of privacyNoticeKeys()) {
      expect(typeof catalog[key]).toBe('string')
      expect(catalog[key].trim().length).toBeGreaterThan(0)
      expect([key, placeholders(catalog[key])]).toEqual([key, placeholders((en as Record<string, string>)[key])])
    }
    // The club's name is filled in where the notice names the controller and in the children's version.
    for (const key of [
      PRIVACY_NOTICE_PAGE_KEYS.intro,
      'club_core.privacy.controller.lead1',
      'club_core.privacy.kids.lead1',
    ]) {
      expect(placeholders(catalog[key])).toEqual(['club'])
    }
  })

  it('holds no key in the club_core.privacy namespace that the page does not show', () => {
    const shown = new Set(privacyNoticeKeys())
    for (const catalog of Object.values(catalogs)) {
      const unused = Object.keys(catalog).filter((key) => key.startsWith('club_core.privacy.') && !shown.has(key))
      expect(unused).toEqual([])
    }
  })
})
