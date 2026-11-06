// The one navigation definition of the member pages (README 3.1; E06-S19 #101).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BACKEND_HREF,
  MEMBER_SHELL_LABEL_KEYS,
  SIGN_OUT_ACTION,
  hasStaffContext,
  memberNav,
  memberShellLabels,
} from '../member/member-nav.ts'

const labels = memberShellLabels((key) => `t:${key}`, 'people.club.nav')

const currentOf = (pathname, extraTab) => {
  const nav = memberNav({ pathname, contexts: [], labels, extraTab })
  return [...nav.tabs.filter((tab) => tab.current).map((tab) => tab.href), ...(nav.more.current ? ['more'] : [])]
}

test('reads every label from the module prefix, `label` for the navigation name', () => {
  assert.equal(MEMBER_SHELL_LABEL_KEYS.length, 14)
  assert.equal(labels.nav, 't:people.club.nav.label')
  assert.equal(labels.signOut, 't:people.club.nav.signOut')
  assert.equal(labels.allWards, 't:people.club.nav.allWards')
})

test('builds Today, Calendar, Messages and More with Profile for a member without staff contexts', () => {
  const nav = memberNav({ pathname: '/club', contexts: ['self', 'guardian'], labels })
  assert.deepEqual(
    nav.tabs.map(({ href, icon, label }) => [href, icon, label]),
    [
      ['/club', 'today', 't:people.club.nav.today'],
      ['/club/calendar', 'calendar', 't:people.club.nav.calendar'],
      ['/club/messages', 'messages', 't:people.club.nav.messages'],
    ],
  )
  assert.deepEqual(nav.more, {
    label: 't:people.club.nav.more',
    current: false,
    items: [{ href: '/club/profile', label: 't:people.club.nav.profile', current: false }],
  })
  assert.equal(SIGN_OUT_ACTION, '/api/auth/logout')
})

test('adds the admin panel behind More for a staff context', () => {
  for (const context of ['club_admin', 'coordinator']) {
    const nav = memberNav({ pathname: '/club', contexts: ['self', context], labels })
    assert.deepEqual(nav.more.items.at(-1), { href: BACKEND_HREF, label: 't:people.club.nav.backend', current: false })
  }
  assert.equal(hasStaffContext(['self', 'guardian']), false)
  assert.equal(hasStaffContext(['coach', 'coordinator']), true)
})

test('keeps a coach on the phone: no admin panel without a sessions perspective there (E06-S15 #97)', () => {
  assert.equal(hasStaffContext(['self', 'coach']), false)
  const nav = memberNav({ pathname: '/club', contexts: ['self', 'coach'], labels })
  assert.equal(
    nav.more.items.some((item) => item.href === BACKEND_HREF),
    false,
  )
})

test('marks the current tab for a page and the pages below it', () => {
  assert.deepEqual(currentOf('/club'), ['/club'])
  assert.deepEqual(currentOf('/club/calendar'), ['/club/calendar'])
  assert.deepEqual(currentOf('/club/occurrences/abc/attendance'), ['/club/calendar'])
  assert.deepEqual(currentOf('/club/messages'), ['/club/messages'])
  assert.deepEqual(currentOf('/club/messages/t-1'), ['/club/messages'])
  assert.deepEqual(currentOf('/club/profile'), ['more'])
  assert.deepEqual(currentOf('/club/wards/p-1'), ['more'])
  assert.deepEqual(currentOf('/club/calendarx'), [])
})

test('places a granted fourth tab before More and marks it current under its path', () => {
  const extraTab = { href: '/club/payments', label: 'Payments', icon: 'payments' }
  const nav = memberNav({ pathname: '/club/payments/return', contexts: [], labels, extraTab })
  assert.deepEqual(
    nav.tabs.map((tab) => tab.href),
    ['/club', '/club/calendar', '/club/messages', '/club/payments'],
  )
  assert.deepEqual(currentOf('/club/payments/return', extraTab), ['/club/payments'])
  assert.equal(memberNav({ pathname: '/club', contexts: [], labels, extraTab: null }).tabs.length, 3)
})
