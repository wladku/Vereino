// The club's "today" in the browser (#231): the date of an instant in the club zone, the browser-zone fallback and the
// provider and hook the pages use.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { browserTimeZone, clubToday, monthOf } from '../admin/club-today.ts'
import { ClubTimeZoneProvider, useClubTimeZone, useClubToday } from '../admin/club-today-context.tsx'

const h = React.createElement

// 23:04 UTC on 2026-11-08 is 00:04 on 2026-11-09 in Warsaw (the CI run that found #231).
const LATE_UTC = new Date('2026-11-08T23:04:00Z')

test('the club zone decides the day, not UTC or the browser', () => {
  assert.equal(clubToday(LATE_UTC, 'Europe/Warsaw'), '2026-11-09')
  assert.equal(clubToday(LATE_UTC, 'UTC'), '2026-11-08')
  assert.equal(clubToday(LATE_UTC, 'America/New_York'), '2026-11-08')
})

test('without a zone, or with one the runtime does not know, the browser zone answers', () => {
  const browser = clubToday(LATE_UTC, browserTimeZone())
  assert.equal(clubToday(LATE_UTC, null), browser)
  assert.equal(clubToday(LATE_UTC, ''), browser)
  assert.equal(clubToday(LATE_UTC, 'Mars/Olympus_Mons'), browser)
})

test('the browser zone is an IANA zone the runtime accepts', () => {
  const zone = browserTimeZone()
  assert.equal(typeof zone, 'string')
  assert.match(clubToday(LATE_UTC, zone), /^\d{4}-\d{2}-\d{2}$/)
})

test('the month of a date is its YYYY-MM prefix', () => {
  assert.equal(monthOf('2026-11-09'), '2026-11')
})

function Probe() {
  return h('span', { 'data-zone': useClubTimeZone() ?? 'none' }, useClubToday())
}

test('the hook reads the zone the provider gives and today in that zone', () => {
  const markup = renderToStaticMarkup(h(ClubTimeZoneProvider, { timeZone: 'Pacific/Kiritimati' }, h(Probe)))
  assert.equal(markup, `<span data-zone="Pacific/Kiritimati">${clubToday(new Date(), 'Pacific/Kiritimati')}</span>`)
})

test('without a provider the hook answers in the browser zone', () => {
  assert.equal(renderToStaticMarkup(h(Probe)), `<span data-zone="none">${clubToday(new Date(), null)}</span>`)
  assert.equal(renderToStaticMarkup(h(ClubTimeZoneProvider, { timeZone: null })), '')
})
