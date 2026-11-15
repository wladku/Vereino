// The one navigation definition of the member pages (README 3.1; E06-S19 #101; navigation spec TEST-N05, #258): the
// fourth-tab rule, the More list and its order, and the current marks for every combination of the feature list, the
// adult payer flag, the staff contexts and the path.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BACKEND_HREF,
  CLUB_CASH_HREF,
  CLUB_FACILITY_TODAY_HREF,
  CLUB_GROUP_PAYMENTS_HREF,
  CLUB_GROUPS_HREF,
  CLUB_MY_UNITS_HREF,
  CLUB_ORDERS_HREF,
  CLUB_PAYMENTS_HREF,
  CLUB_PLACES_HREF,
  CLUB_PROFILE_HREF,
  MEMBER_MORE_DESTINATIONS,
  MEMBER_NAV_FEATURES,
  MEMBER_SHELL_LABEL_KEYS,
  SIGN_OUT_ACTION,
  hasStaffContext,
  memberNav,
  memberShellLabels,
} from '../member/member-nav.ts'

const labels = memberShellLabels((key) => `t:${key}`, 'people.club.nav')

const GUARDIAN = ['payments.orders.place']
const COACH = ['activities.reports.view_own', 'facilities.view', 'payments.groups.view']
const ATTENDANT = ['facilities.view', 'facilities.log.write']
const PLANNER = ['facilities.maintenance.manage']
const ADMIN = [...MEMBER_NAV_FEATURES]

const nav = (overrides = {}) => memberNav({ pathname: '/club', contexts: [], labels, features: [], ...overrides })
const tabsOf = (result) => result.tabs.map((tab) => tab.href)
const moreOf = (result) => result.more.items.map((item) => item.href)
const currentOf = (pathname, overrides = {}) => {
  const result = nav({ pathname, ...overrides })
  return [...result.tabs.filter((tab) => tab.current).map((tab) => tab.href), ...(result.more.current ? ['more'] : [])]
}

test('reads every label from the module prefix, `label` for the navigation name', () => {
  assert.equal(MEMBER_SHELL_LABEL_KEYS.length, 24)
  assert.equal(labels.nav, 't:people.club.nav.label')
  assert.equal(labels.signOut, 't:people.club.nav.signOut')
  assert.equal(labels.acceptCash, 't:people.club.nav.acceptCash')
  assert.equal(labels.contextCoachCoordinator, 't:people.club.nav.contextCoachCoordinator')
  assert.equal(SIGN_OUT_ACTION, '/api/auth/logout')
})

test('checks one fixed feature list: the Facilities tab and every built More entry, once each', () => {
  assert.deepEqual(MEMBER_NAV_FEATURES, [
    'facilities.view',
    'activities.reports.view_own',
    'facilities.maintenance.manage',
    'facilities.log.write',
    'payments.orders.place',
    'payments.groups.view',
    'payments.cash.record',
  ])
  assert.equal(MEMBER_NAV_FEATURES.includes('groups.view'), false)
  assert.deepEqual(
    MEMBER_MORE_DESTINATIONS.map((entry) => entry.href),
    [
      CLUB_MY_UNITS_HREF,
      CLUB_GROUPS_HREF,
      CLUB_PLACES_HREF,
      CLUB_FACILITY_TODAY_HREF,
      CLUB_ORDERS_HREF,
      CLUB_GROUP_PAYMENTS_HREF,
      CLUB_CASH_HREF,
    ],
  )
})

test('builds Today, Calendar, Messages and More with Profile for a member without grants', () => {
  const result = nav({ contexts: ['self', 'guardian'] })
  assert.deepEqual(
    result.tabs.map(({ href, icon, label }) => [href, icon, label]),
    [
      ['/club', 'today', 't:people.club.nav.today'],
      ['/club/calendar', 'calendar', 't:people.club.nav.calendar'],
      ['/club/messages', 'messages', 't:people.club.nav.messages'],
    ],
  )
  assert.deepEqual(result.more, {
    label: 't:people.club.nav.more',
    current: false,
    items: [{ href: CLUB_PROFILE_HREF, label: 't:people.club.nav.profile', current: false }],
  })
})

test('degrades to three tabs and More with Profile while the feature check is pending or failed', () => {
  for (const contexts of [['self'], ['coach'], ['facility_operator']]) {
    const result = nav({ contexts, paymentsVisible: true, features: null })
    assert.deepEqual(tabsOf(result), ['/club', '/club/calendar', '/club/messages'])
    assert.deepEqual(moreOf(result), [CLUB_PROFILE_HREF])
  }
  // The admin panel comes from the profile's contexts, not from the check.
  assert.deepEqual(moreOf(nav({ contexts: ['club_admin'], features: null })), [CLUB_PROFILE_HREF, BACKEND_HREF])
})

test('a guardian (adult payer) gets Payments as the fourth tab and Orders behind More', () => {
  const result = nav({ contexts: ['self', 'guardian'], paymentsVisible: true, features: GUARDIAN })
  assert.deepEqual(result.tabs.at(-1), {
    href: CLUB_PAYMENTS_HREF,
    label: 't:people.club.nav.payments',
    icon: 'payments',
    current: false,
  })
  assert.deepEqual(result.more.items, [
    { href: CLUB_PROFILE_HREF, label: 't:people.club.nav.profile', current: false },
    { href: CLUB_ORDERS_HREF, label: 't:people.club.nav.orders', current: false },
  ])
})

test('a minor gets three tabs and More with Profile: no Payments and no Orders', () => {
  const result = nav({ contexts: ['self'], paymentsVisible: false, features: [] })
  assert.deepEqual(tabsOf(result), ['/club', '/club/calendar', '/club/messages'])
  assert.deepEqual(moreOf(result), [CLUB_PROFILE_HREF])
})

test('a coach without own payments gets Facilities as the fourth tab and no Facilities entry behind More', () => {
  const result = nav({ contexts: ['self', 'coach'], features: COACH })
  assert.deepEqual(result.tabs.at(-1), {
    href: CLUB_PLACES_HREF,
    label: 't:people.club.nav.facilities',
    icon: 'facilities',
    current: false,
  })
  assert.deepEqual(moreOf(result), [CLUB_PROFILE_HREF, CLUB_MY_UNITS_HREF, CLUB_GROUP_PAYMENTS_HREF])
  assert.equal(result.more.items.find((item) => item.href === CLUB_MY_UNITS_HREF).label, 't:people.club.nav.myUnits')
})

test('a coach who pays too gets Payments as the tab and Facilities and booking behind More', () => {
  const result = nav({
    contexts: ['self', 'guardian', 'coach', 'coordinator'],
    paymentsVisible: true,
    features: [...COACH, ...GUARDIAN],
  })
  assert.equal(result.tabs.at(-1).href, CLUB_PAYMENTS_HREF)
  assert.deepEqual(moreOf(result), [
    CLUB_PROFILE_HREF,
    CLUB_MY_UNITS_HREF,
    CLUB_PLACES_HREF,
    CLUB_ORDERS_HREF,
    CLUB_GROUP_PAYMENTS_HREF,
    BACKEND_HREF,
  ])
  assert.equal(result.more.items[2].label, 't:people.club.nav.facilitiesMore')
})

test('the attendant gets Facilities as the tab and Today at the facility behind More', () => {
  const result = nav({ contexts: ['facility_operator'], features: ATTENDANT })
  assert.equal(result.tabs.at(-1).href, CLUB_PLACES_HREF)
  assert.deepEqual(moreOf(result), [CLUB_PROFILE_HREF, CLUB_FACILITY_TODAY_HREF])
  assert.equal(result.more.items[1].label, 't:people.club.nav.facilityToday')
})

test('a maintenance planner without `facilities.view` reaches the places from More', () => {
  const result = nav({ contexts: ['self'], features: PLANNER })
  assert.deepEqual(tabsOf(result), ['/club', '/club/calendar', '/club/messages'])
  assert.deepEqual(moreOf(result), [CLUB_PROFILE_HREF, CLUB_PLACES_HREF])
})

test('the administrator gets every built entry in the table order, Accept cash and the admin panel last', () => {
  const result = nav({ contexts: ['self', 'club_admin'], paymentsVisible: true, features: ADMIN })
  assert.deepEqual(moreOf(result), [
    CLUB_PROFILE_HREF,
    CLUB_MY_UNITS_HREF,
    CLUB_PLACES_HREF,
    CLUB_FACILITY_TODAY_HREF,
    CLUB_ORDERS_HREF,
    CLUB_GROUP_PAYMENTS_HREF,
    CLUB_CASH_HREF,
    BACKEND_HREF,
  ])
  assert.equal(result.more.items.at(-2).label, 't:people.club.nav.acceptCash')
  assert.equal(result.more.items.at(-3).label, 't:people.club.nav.groupPayments')
  // Groups waits for its page (spec A, REQ-A11) whatever the grants.
  assert.equal(moreOf(nav({ features: ['groups.view'] })).includes(CLUB_GROUPS_HREF), false)
  assert.equal(labels.groups, 't:people.club.nav.groups')
})

test('offers the admin panel to a staff context only, never to a coach (E06-S15 #97)', () => {
  for (const context of ['club_admin', 'coordinator']) {
    assert.deepEqual(nav({ contexts: ['self', context] }).more.items.at(-1), {
      href: BACKEND_HREF,
      label: 't:people.club.nav.backend',
      current: false,
    })
  }
  assert.equal(hasStaffContext(['self', 'guardian']), false)
  assert.equal(hasStaffContext(['self', 'coach']), false)
  assert.equal(hasStaffContext(['coach', 'coordinator']), true)
  assert.equal(moreOf(nav({ contexts: ['self', 'coach'], features: COACH })).includes(BACKEND_HREF), false)
})

test('marks Today, Calendar and Messages for their pages and the pages below them', () => {
  assert.deepEqual(currentOf('/club'), ['/club'])
  assert.deepEqual(currentOf('/club/calendar'), ['/club/calendar'])
  assert.deepEqual(currentOf('/club/occurrences/abc/attendance'), ['/club/calendar'])
  assert.deepEqual(currentOf('/club/events/new'), ['/club/calendar'])
  assert.deepEqual(currentOf('/club/messages'), ['/club/messages'])
  assert.deepEqual(currentOf('/club/messages/t-1'), ['/club/messages'])
  assert.deepEqual(currentOf('/club/calendarx'), [])
})

test('marks Payments for payments and orders, and the Orders entry on an order', () => {
  const payer = { paymentsVisible: true, features: GUARDIAN }
  assert.deepEqual(currentOf('/club/payments/return', payer), [CLUB_PAYMENTS_HREF])
  assert.deepEqual(currentOf('/club/orders/c-1', payer), [CLUB_PAYMENTS_HREF])
  const orders = nav({ pathname: '/club/orders', ...payer })
  assert.equal(orders.more.items.find((item) => item.href === CLUB_ORDERS_HREF).current, true)
  // Without the Payments tab an order belongs to More.
  assert.deepEqual(currentOf('/club/orders', { features: GUARDIAN }), ['more'])
})

test('marks More for the profile, wards, facility, coach and cash pages, whatever the grants', () => {
  for (const pathname of [
    '/club/profile',
    '/club/wards/p-1',
    '/club/facility',
    '/club/coach/units',
    '/club/coach/payments',
    '/club/cash',
  ]) {
    assert.deepEqual(currentOf(pathname), ['more'], pathname)
    assert.deepEqual(currentOf(pathname, { features: null }), ['more'], pathname)
  }
  const profile = nav({ pathname: '/club/wards/p-1' })
  assert.equal(profile.more.items[0].current, true)
  const coach = nav({ pathname: '/club/coach/units', contexts: ['coach'], features: COACH })
  assert.deepEqual(
    coach.more.items.filter((item) => item.current).map((item) => item.href),
    [CLUB_MY_UNITS_HREF],
  )
})

test('marks the places as the Facilities tab when it is the fourth tab, otherwise as More', () => {
  assert.deepEqual(currentOf('/club/places/p-1', { features: COACH }), [CLUB_PLACES_HREF])
  assert.deepEqual(currentOf('/club/places', { paymentsVisible: true, features: COACH }), ['more'])
  assert.deepEqual(currentOf('/club/places', { features: PLANNER }), ['more'])
  assert.deepEqual(currentOf('/club/places', { features: null }), ['more'])
})
