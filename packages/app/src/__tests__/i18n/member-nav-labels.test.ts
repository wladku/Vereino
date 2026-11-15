// TEST-N11 of the navigation spec (REQ-N05, REQ-N11; #257): the member shell reads its labels from five module
// catalogs, so one label has five copies. Every copy of a label must say the same, in Polish and in English, or the
// bottom bar changes its words from page to page.
import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

const PREFIXES = [
  ['people', 'people.club.nav.'],
  ['activities', 'activities.club.nav.'],
  ['communication', 'communication.club.nav.'],
  ['payments', 'payments.club.nav.'],
  ['facilities', 'facilities.places.nav.'],
] as const

function navLabels(locale: string): Map<string, Map<string, string>> {
  const bySuffix = new Map<string, Map<string, string>>()
  for (const [moduleId, prefix] of PREFIXES) {
    const file = path.join(__dirname, '..', '..', 'modules', moduleId, 'i18n', `${locale}.json`)
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
    for (const [key, value] of Object.entries(catalog)) {
      if (!key.startsWith(prefix) || typeof value !== 'string') continue
      const suffix = key.slice(prefix.length)
      const copies = bySuffix.get(suffix) ?? new Map<string, string>()
      copies.set(key, value)
      bySuffix.set(suffix, copies)
    }
  }
  return bySuffix
}

describe.each(['pl', 'en'])('member nav labels (%s)', (locale) => {
  const labels = navLabels(locale)

  it('reads the labels of all five catalogs', () => {
    expect(labels.get('today')?.size).toBe(5)
  })

  it.each([...labels.keys()])('every copy of "%s" says the same', (suffix) => {
    const values = new Set(labels.get(suffix)?.values())
    expect([...values]).toHaveLength(1)
  })
})
