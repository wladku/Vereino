// P-29 expansion rules (foundation III DD-M06; the unit half of TEST-M01).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AUDIENCE_KINDS,
  AUDIENCE_MAX_RECIPIENTS,
  CONTACT_RESOLVER_TOKEN,
  audienceCounts,
  audienceProviderToken,
  expandAudience,
  isAudienceKind,
  minorMemberIds,
} from '../audience.ts'

const TODAY = '2026-11-02'

const contact = (personId, overrides = {}) => ({
  personId,
  name: personId,
  userId: null,
  email: null,
  locale: 'pl',
  birthDate: null,
  ...overrides,
})

// The TEST-M01 group: participants aged 9 (no account), 14 (with an account) and 19; a guardian of two children in the
// group with an account, a guardian without an account, a guardian without an e-mail and without an account; a coach
// who is also a guardian of the 9-year-old.
const people = new Map(
  [
    contact('p09', { birthDate: '2017-05-01', email: 'p09@example.test' }),
    contact('p14', { birthDate: '2012-03-01', userId: 'u14', email: 'p14@example.test', locale: 'en' }),
    contact('p19', { birthDate: '2007-01-01', email: 'p19@example.test' }),
    contact('g2', { userId: 'ug2', email: 'g2@example.test', birthDate: '1985-01-01' }),
    contact('gNoAccount', { email: 'gna@example.test' }),
    contact('gNothing'),
    contact('coach', { userId: 'uc', email: 'coach@example.test' }),
  ].map((entry) => [entry.personId, entry]),
)

const members = [
  { personId: 'p09', reason: 'participant' },
  { personId: 'p14', reason: 'participant' },
  { personId: 'p19', reason: 'participant' },
  { personId: 'coach', reason: 'coach' },
]

const guardiansByWard = new Map([
  ['p09', ['g2', 'coach', 'gNothing']],
  ['p14', ['g2', 'gNoAccount']],
])

test('the kinds, the tokens and the size cap are fixed contract values', () => {
  assert.deepEqual(AUDIENCE_KINDS, ['club', 'section', 'group', 'activity', 'occurrence', 'persons'])
  assert.equal(audienceProviderToken('group'), 'vereino.audience.group')
  assert.equal(CONTACT_RESOLVER_TOKEN, 'vereino.contactResolver')
  assert.equal(AUDIENCE_MAX_RECIPIENTS, 2000)
  assert.equal(isAudienceKind('occurrence'), true)
  assert.equal(isAudienceKind('direct'), false)
  assert.equal(isAudienceKind(7), false)
})

test('minorMemberIds names the minors reached as participants or directly, never coaches', () => {
  const extra = new Map([...people, ['youngCoach', contact('youngCoach', { birthDate: '2010-01-01' })]])
  assert.deepEqual(
    minorMemberIds(
      [
        ...members,
        { personId: 'p09', reason: 'direct' },
        { personId: 'youngCoach', reason: 'coach' },
        { personId: 'unknown', reason: 'participant' },
      ],
      extra,
      TODAY,
    ),
    ['p09', 'p14'],
  )
})

test('the TEST-M01 group expands per the Thread rule', () => {
  const { recipients, unreachable } = expandAudience({ members, contacts: people, guardiansByWard }, TODAY)
  const byId = Object.fromEntries(recipients.map((recipient) => [recipient.personId, recipient]))
  // The 9-year-old without an account is reached only through the guardians.
  assert.equal(byId.p09, undefined)
  // The 14-year-old with an account is kept beside their guardians.
  assert.deepEqual(byId.p14, {
    personId: 'p14',
    userId: 'u14',
    email: 'p14@example.test',
    locale: 'en',
    reasons: ['participant'],
    channels: ['in_app', 'email'],
  })
  // The 19-year-old is kept: no account → e-mail only.
  assert.deepEqual(byId.p19.channels, ['email'])
  // The guardian of two children appears once.
  assert.deepEqual(byId.g2.reasons, ['guardian'])
  assert.deepEqual(byId.g2.channels, ['in_app', 'email'])
  // The coach who is also a guardian gets one entry with both reasons.
  assert.deepEqual(byId.coach.reasons, ['coach', 'guardian'])
  // No account → e-mail only; neither → unreachable (a recipient without channels).
  assert.deepEqual(byId.gNoAccount.channels, ['email'])
  assert.deepEqual(byId.gNothing.channels, [])
  assert.deepEqual(unreachable, ['gNothing'])
  assert.deepEqual(
    recipients.map((recipient) => recipient.personId),
    ['coach', 'g2', 'gNoAccount', 'gNothing', 'p14', 'p19'],
  )
  assert.deepEqual(audienceCounts(recipients), { recipients: 5, withoutEmail: 0, unreachable: 1 })
})

test('the author is excluded after the expansion, also when reached as a guardian', () => {
  const { recipients } = expandAudience({ members, contacts: people, guardiansByWard }, TODAY, {
    exclude: ['coach'],
  })
  assert.equal(
    recipients.some((recipient) => recipient.personId === 'coach'),
    false,
  )
})

test('a minor without an account and without an active guardian is unreachable with their own reason', () => {
  const contacts = new Map([
    ['m1', contact('m1', { birthDate: '2015-01-01', email: 'm1@example.test' })],
    ['m2', contact('m2', { birthDate: '2015-01-01' })],
    ['gone', contact('gone', { userId: 'ugone' })],
  ])
  const { recipients, unreachable } = expandAudience(
    {
      members: [
        { personId: 'm1', reason: 'direct' },
        { personId: 'm2', reason: 'participant' },
        { personId: 'm2', reason: 'participant' },
        { personId: 'missing', reason: 'participant' },
      ],
      contacts,
      // A guardian id without a contact (left the club) does not count.
      guardiansByWard: new Map([['m2', ['nobody']]]),
    },
    TODAY,
    { exclude: ['m2'] },
  )
  assert.deepEqual(recipients, [
    { personId: 'm1', userId: null, email: null, locale: 'pl', reasons: ['direct'], channels: [] },
  ])
  assert.deepEqual(unreachable, ['m1'])
})

test('an unreachable minor who is also a coach is kept once, as a coach', () => {
  const contacts = new Map([['young', contact('young', { birthDate: '2011-01-01', email: 'y@example.test' })]])
  const { recipients } = expandAudience(
    {
      members: [
        { personId: 'young', reason: 'participant' },
        { personId: 'young', reason: 'coach' },
      ],
      contacts,
      guardiansByWard: new Map(),
    },
    TODAY,
  )
  assert.deepEqual(recipients, [
    { personId: 'young', userId: null, email: 'y@example.test', locale: 'pl', reasons: ['coach'], channels: ['email'] },
  ])
})

test('an account holder without an address is reached in the app and counted without e-mail', () => {
  const contacts = new Map([
    ['a', contact('a', { userId: 'ua' })],
    ['b', contact('b', { userId: 'ub', email: 'b@example.test' })],
  ])
  const { recipients } = expandAudience(
    {
      members: [
        { personId: 'b', reason: 'direct' },
        { personId: 'a', reason: 'direct' },
      ],
      contacts,
      guardiansByWard: new Map(),
    },
    TODAY,
  )
  assert.deepEqual(
    recipients.map((recipient) => recipient.personId),
    ['a', 'b'],
  )
  assert.deepEqual(audienceCounts(recipients), { recipients: 2, withoutEmail: 1, unreachable: 0 })
  assert.deepEqual(audienceCounts([]), { recipients: 0, withoutEmail: 0, unreachable: 0 })
})
