// REQ-N02 (unit part, navigation spec DD-N02): the rules of a page whose tabs are routes — which tabs the person
// sees, when the strip shows, where a tab change and a `?tab=` alias lead.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  routeTabAliasHref,
  routeTabChangeHref,
  routeTabFeatures,
  showsRouteTabStrip,
  visibleRouteTabs,
} from '../admin/route-tabs-model.ts'

const TABS = [
  { value: 'logs', href: '/backend/facilities/logs', features: ['facilities.log.write'], alias: 'logs' },
  { value: 'incidents', href: '/backend/facilities/incidents', features: ['facilities.log.write'], alias: 'incidents' },
  { value: 'bans', href: '/backend/facilities/bans', features: ['facilities.incidents.manage'], alias: 'bans' },
  {
    value: 'maintenance',
    href: '/backend/facilities/maintenance',
    features: ['facilities.maintenance.manage'],
    alias: 'maint',
  },
]
const values = (tabs) => tabs.map((tab) => tab.value)

test('routeTabFeatures lists every feature of the tabs once', () => {
  assert.deepEqual(routeTabFeatures(TABS), [
    'facilities.log.write',
    'facilities.incidents.manage',
    'facilities.maintenance.manage',
  ])
})

test('visibleRouteTabs keeps the tabs whose features the person holds, wildcards included, and the current tab', () => {
  assert.deepEqual(values(visibleRouteTabs(TABS, 'logs', ['facilities.*'])), [
    'logs',
    'incidents',
    'bans',
    'maintenance',
  ])
  assert.deepEqual(values(visibleRouteTabs(TABS, 'logs', ['*'])), ['logs', 'incidents', 'bans', 'maintenance'])
  assert.deepEqual(values(visibleRouteTabs(TABS, 'logs', ['facilities.log.write'])), ['logs', 'incidents'])
  assert.deepEqual(values(visibleRouteTabs(TABS, 'bans', [])), ['bans'])
  assert.deepEqual(values(visibleRouteTabs(TABS, 'incidents', null)), ['incidents'])
})

test('showsRouteTabStrip needs two visible tabs', () => {
  assert.equal(showsRouteTabStrip(TABS.slice(0, 2)), true)
  assert.equal(showsRouteTabStrip(TABS.slice(0, 1)), false)
  assert.equal(showsRouteTabStrip([]), false)
})

test('routeTabChangeHref leads to another visible tab only', () => {
  const visible = TABS.slice(0, 2)
  assert.equal(routeTabChangeHref(visible, 'logs', 'incidents'), '/backend/facilities/incidents')
  assert.equal(routeTabChangeHref(visible, 'logs', 'logs'), null)
  assert.equal(routeTabChangeHref(visible, 'logs', 'bans'), null)
})

test('routeTabAliasHref leads a known alias of a later tab to its route and ignores the rest', () => {
  assert.equal(routeTabAliasHref(TABS, 'maint'), '/backend/facilities/maintenance')
  assert.equal(routeTabAliasHref(TABS, 'incidents'), '/backend/facilities/incidents')
  assert.equal(routeTabAliasHref(TABS, 'logs'), null)
  assert.equal(routeTabAliasHref(TABS, 'maintenance'), null)
  assert.equal(routeTabAliasHref(TABS, '//evil.example'), null)
  assert.equal(routeTabAliasHref(TABS, ''), null)
  assert.equal(routeTabAliasHref(TABS, null), null)
})
