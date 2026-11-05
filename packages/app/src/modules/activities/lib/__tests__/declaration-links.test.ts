import { describe, expect, it } from '@jest/globals'
import {
  DECLARATION_LINK_TTL_MS,
  DECLARATION_REMINDERS_CRON,
  MAX_LINKS_PER_HOUR,
  declarationLinkPath,
  linkExpiry,
  linkPersonIds,
  linkRequestOwners,
  linkRequestPath,
  normalizeEmail,
  personIdsWithEmail,
  reminderKey,
  reminderOwners,
  sessionWhenLabel,
} from '../declaration-links'

const NOW = new Date('2026-11-05T12:00:00.000Z')
const guardians = new Map<string, string[]>([
  ['ward-1', ['mum', 'dad']],
  ['ward-2', ['mum']],
  ['ward-3', []],
])

describe('declaration link addresses (REQ-017)', () => {
  it('normalizes the blanks and the letter case of an address', () => {
    expect(normalizeEmail('  Anna.Nowak@Example.PL ')).toBe('anna.nowak@example.pl')
  })

  it('finds every person with the address and nobody for an empty or unknown one', () => {
    const contacts = [
      { personId: 'mum', email: 'Mum@example.test' },
      { personId: 'adult-ward', email: 'mum@example.test ' },
      { personId: 'dad', email: null },
      { personId: 'other', email: 'other@example.test' },
    ]
    expect(personIdsWithEmail(contacts, ' MUM@example.test')).toEqual(['mum', 'adult-ward'])
    expect(personIdsWithEmail(contacts, 'nobody@example.test')).toEqual([])
    expect(personIdsWithEmail(contacts, '   ')).toEqual([])
  })
})

describe('declaration link expiry', () => {
  it('ends with the session, at most after the time to live, and not at all for an ended session', () => {
    const end = new Date('2026-11-06T18:30:00.000Z')
    expect(linkExpiry(NOW, end)).toEqual(end)
    const far = new Date(NOW.getTime() + DECLARATION_LINK_TTL_MS + 60_000)
    expect(linkExpiry(NOW, far)).toEqual(new Date(NOW.getTime() + DECLARATION_LINK_TTL_MS))
    expect(linkExpiry(NOW, new Date('2026-11-06T00:00:00.000Z'), 60_000)).toEqual(new Date(NOW.getTime() + 60_000))
    expect(linkExpiry(NOW, NOW)).toBeNull()
    expect(linkExpiry(NOW, new Date(NOW.getTime() - 1))).toBeNull()
  })
})

describe('whom a link declares for', () => {
  it('lists the holder when they participate, then their wards, in roster order without repeats', () => {
    expect(linkPersonIds('mum', ['ward-2', 'mum', 'ward-1', 'ward-3', 'ward-2'], guardians)).toEqual([
      'ward-2',
      'mum',
      'ward-1',
    ])
    expect(linkPersonIds('dad', ['ward-1', 'ward-2'], guardians)).toEqual(['ward-1'])
    expect(linkPersonIds('stranger', ['ward-1', 'ward-2', 'ward-3', 'adult'], guardians)).toEqual([])
  })

  it('reaches only the matched persons who may declare for somebody in the session', () => {
    expect(linkRequestOwners(['mum', 'mum', 'stranger', 'ward-3'], ['ward-1', 'ward-3'], guardians)).toEqual([
      'mum',
      'ward-3',
    ])
    expect(linkRequestOwners([], ['ward-1'], guardians)).toEqual([])
  })
})

describe('evening reminders', () => {
  it('reminds the guardians of an undeclared ward, else the participant, each once', () => {
    expect(reminderOwners(['ward-1', 'ward-2', 'ward-3', 'adult'], new Set(['ward-3']), guardians)).toEqual([
      'mum',
      'dad',
      'adult',
    ])
    expect(reminderOwners(['ward-1'], new Set(['ward-1']), guardians)).toEqual([])
  })

  it('keys one reminder per session and person and runs at 18:00', () => {
    expect(reminderKey('occ', 'mum')).toBe('activities:declaration-reminder:occ:mum')
    expect(DECLARATION_REMINDERS_CRON).toBe('0 18 * * *')
    expect(MAX_LINKS_PER_HOUR).toBe(3)
  })
})

describe('declaration link paths (M-13, M-14)', () => {
  it('builds the token page and the link request page with encoded values', () => {
    expect(declarationLinkPath('abc_-123')).toBe('/club/d/abc_-123')
    expect(declarationLinkPath('a/b')).toBe('/club/d/a%2Fb')
    expect(linkRequestPath('dev academy', 'occ-1')).toBe('/club/link?club=dev+academy&session=occ-1')
  })
})

describe('the e-mail date line', () => {
  it('formats the date and the time range in the club zone and the recipient language', () => {
    const start = new Date('2026-11-10T16:00:00.000Z')
    const end = new Date('2026-11-10T17:30:00.000Z')
    expect(sessionWhenLabel(start, end, 'en', 'Europe/Warsaw')).toEqual({
      date: 'Tuesday, November 10',
      time: '17:00–18:30',
    })
    expect(sessionWhenLabel(start, end, 'pl', 'Europe/Warsaw').time).toBe('17:00–18:30')
  })
})
